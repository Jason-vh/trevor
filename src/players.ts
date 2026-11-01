export interface Player {
  name: string;
  squashCityUserId: string;
  email: string;
}

/** The SquashCity account Trevor books with; gets calendar invites like the other players. */
export const ACCOUNT_OWNER = { name: "Jason van Hattum", email: "jason@vhattum.com" };

// Players booked alongside the account owner (player slot 2, 3, ...).
// The account owner (player 1) is always assumed.
export const PLAYERS: Player[] = [{ name: "Amp Varavarn", squashCityUserId: "1280498", email: "ampthanapa@gmail.com" }];
