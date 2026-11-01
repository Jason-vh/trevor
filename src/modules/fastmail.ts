const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"];
const TIMEOUT_MS = 30_000;

type Call = [method: string, args: Record<string, unknown>, tag: string];
type MethodResponse = [name: string, args: Record<string, unknown>, tag: string];
type Account = { accountId: string; draftsId: string; identityId: string };

/** Fastmail may have sent the email: the request went out, but no clear answer came back. */
export class MaybeSentError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return isRecord(field) ? field : undefined;
}

function stringAt(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function listAt(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value["list"])) return [];
  return value["list"].filter(isRecord);
}

function methodResponses(body: unknown): MethodResponse[] {
  if (!isRecord(body) || !Array.isArray(body["methodResponses"])) {
    throw new Error("JMAP answered without methodResponses");
  }
  return body["methodResponses"].map((response: unknown) => {
    if (!Array.isArray(response) || typeof response[0] !== "string" || !isRecord(response[1])) {
      throw new Error("JMAP answered with a malformed method response");
    }
    return [response[0], response[1], String(response[2])];
  });
}

function describeError(error: Record<string, unknown> | undefined) {
  return stringAt(error, "description") ?? stringAt(error, "type") ?? "no reason given";
}

function createdId(response: MethodResponse | undefined, creationId: string) {
  if (!response || response[0] === "error") return undefined;
  return stringAt(recordAt(recordAt(response[1], "created"), creationId), "id");
}

function failureOf(response: MethodResponse | undefined, creationId: string) {
  if (!response) return "no answer";
  if (response[0] === "error") return describeError(response[1]);
  return describeError(recordAt(recordAt(response[1], "notCreated"), creationId));
}

/** Sends ready-made emails from one of the account's addresses through Fastmail's JMAP API. */
export class FastmailSender {
  private account: Promise<Account> | undefined;

  constructor(
    private readonly baseUrl: string,
    private readonly fromEmail: string,
  ) {}

  async send(message: Buffer) {
    const { accountId, draftsId, identityId } = await this.loadAccount();
    const blobId = await this.upload(accountId, message);
    const [imported, submitted] = await this.submit([
      [
        "Email/import",
        {
          accountId,
          emails: {
            invite: { blobId, mailboxIds: { [draftsId]: true }, keywords: { $draft: true, $seen: true } },
          },
        },
        "import",
      ],
      [
        "EmailSubmission/set",
        { accountId, create: { send: { identityId, emailId: "#invite" } }, onSuccessDestroyEmail: ["#send"] },
        "submit",
      ],
    ]);
    if (createdId(submitted, "send")) return;

    const draftId = createdId(imported, "invite");
    if (!draftId) throw new Error(`Fastmail didn't take it: ${failureOf(imported, "invite")}`);
    await this.request([["Email/set", { accountId, destroy: [draftId] }, "discard"]]);
    throw new Error(`Fastmail didn't send it: ${failureOf(submitted, "send")}`);
  }

  private loadAccount() {
    this.account ??= this.findAccount().catch((error: unknown) => {
      this.account = undefined;
      throw error;
    });
    return this.account;
  }

  private async findAccount(): Promise<Account> {
    const response = await fetch(`${this.baseUrl}/jmap/session`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`JMAP session answered ${response.status}`);
    const accountId = stringAt(recordAt(await response.json(), "primaryAccounts"), "urn:ietf:params:jmap:submission");
    if (!accountId) throw new Error("The Fastmail token can't send email");

    // Fastmail leaves ids out unless they're asked for by name.
    const [mailboxes, identities] = await this.request([
      ["Mailbox/get", { accountId, properties: ["id", "role"] }, "mailboxes"],
      ["Identity/get", { accountId, properties: ["id", "email"] }, "identities"],
    ]);
    const draftsId = stringAt(
      listAt(mailboxes).find((mailbox) => mailbox["role"] === "drafts"),
      "id",
    );
    if (!draftsId) throw new Error("Fastmail has no Drafts mailbox");
    const identityId = stringAt(
      listAt(identities).find((identity) => stringAt(identity, "email")?.toLowerCase() === this.fromEmail),
      "id",
    );
    if (!identityId) throw new Error(`Fastmail has no identity for ${this.fromEmail}`);
    return { accountId, draftsId, identityId };
  }

  private async upload(accountId: string, message: Buffer) {
    const response = await fetch(`${this.baseUrl}/jmap/upload/${accountId}/`, {
      method: "POST",
      headers: { "content-type": "message/rfc822" },
      body: new Uint8Array(message),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`JMAP upload answered ${response.status}`);
    const blobId = stringAt(await response.json(), "blobId");
    if (!blobId) throw new Error("JMAP upload answered without a blobId");
    return blobId;
  }

  /** Like `request`, but tells apart a request Fastmail refused from one whose outcome is unknown. */
  private async submit(calls: Call[]): Promise<MethodResponse[]> {
    let response: Response;
    try {
      response = await this.post(calls);
    } catch (error) {
      throw new MaybeSentError("No answer from Fastmail", { cause: error });
    }
    if (response.status >= 500) throw new MaybeSentError(`JMAP answered ${response.status}`);
    if (!response.ok) throw new Error(`JMAP answered ${response.status}`);
    try {
      return methodResponses(await response.json());
    } catch (error) {
      throw new MaybeSentError("Unreadable answer from Fastmail", { cause: error });
    }
  }

  private async request(calls: Call[]) {
    const response = await this.post(calls);
    if (!response.ok) throw new Error(`JMAP answered ${response.status}`);
    return methodResponses(await response.json()).map(([name, args]) => {
      if (name === "error") throw new Error(`JMAP: ${describeError(args)}`);
      return args;
    });
  }

  private post(calls: Call[]) {
    return fetch(`${this.baseUrl}/jmap/api/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ using: USING, methodCalls: calls }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}
