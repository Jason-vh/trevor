import { parseArgs } from "node:util";

import { Weekday } from "@/types";

function isValidDay(day: string): day is Weekday {
  return Object.values(Weekday).includes(day as Weekday);
}

function isValidTime(time: string): boolean {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return timeRegex.test(time);
}

export function getArgs() {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      from: {
        type: "string",
      },
      to: {
        type: "string",
      },
      day: {
        type: "string",
        multiple: true,
      },
    },
    strict: true,
    allowPositionals: true,
  });

  if (!values.from) {
    throw new Error("From time is required");
  }

  if (!values.to) {
    throw new Error("To time is required");
  }

  if (!isValidTime(values.from)) {
    throw new Error(`${values.from} is not a valid from time`);
  }

  if (!isValidTime(values.to)) {
    throw new Error(`${values.to} is not a valid to time`);
  }

  if (!values.day) {
    throw new Error("At least one day is required");
  }

  const days: Weekday[] = values.day.map((day: string) => {
    const _day = day.toLowerCase();
    if (isValidDay(_day)) {
      return _day;
    }

    throw new Error(`${day} is not a valid day`);
  });

  return {
    from: values.from,
    to: values.to,
    days,
  };
}
