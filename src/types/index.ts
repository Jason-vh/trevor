export interface Session {
  cookies: string[];
}

/**
 * indicates availability of a court at a given time
 */
export type CourtAvailability = {
  // court details
  courtId: number;
  courtName: string;

  // time details
  formattedStartTime: string;
  startTimeInMinutes: number;
  formattedDate: string;
  dateISO: string;

  // booking details
  utc: string;

  // other details
  isAvailable: boolean;
  isOwnBooking: boolean;
  offPeak: boolean;
};

export enum Weekday {
  MON = "mon",
  TUE = "tue",
  WED = "wed",
  THU = "thu",
  FRI = "fri",
  SAT = "sat",
  SUN = "sun",
}

export interface Args {
  from: string;
  to: string;
  days: Weekday[];
  book: boolean;
}

export type BookingResult = {
  success: boolean;
  slot: CourtAvailability;
  error?: string;
  reservationId?: string;
};
