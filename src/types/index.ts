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

  // other details
  isAvailable: boolean;
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

export type ISODate = string;

export interface MonitorWindow {
  id: string;
  chatId: string;
  fromTime: string;
  toTime: string;
  description?: string;
  /**
   * Either dates or daysOfWeek must be provided.
   */
  dates?: ISODate[];
  daysOfWeek?: Weekday[];
  createdAt: string;
  updatedAt: string;
  active: boolean;
  lastNotified?: Record<ISODate, string[]>;
}
