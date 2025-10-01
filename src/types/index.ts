// Shared type definitions

export interface Session {
  cookies: string[];
  expiresAt: Date;
  userId?: string;
}

export interface Availability {
  court: string;
  courtId: string;
  date: Date;
  dateString: string; // YYYY-MM-DD format
  timeSlot: string;
  timestamp: string; // Unix timestamp for booking
  available: boolean;
  bookingUrl?: string;
}

export interface BookingRequest {
  resourceId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  players?: string[]; // Optional player names
}

export interface BookingResult {
  success: boolean;
  reservationId?: string;
  message?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  duration: number;
}

export interface Court {
  id: string;
  name: string;
  type?: string;
}

export interface Config {
  targetUrl: string;
  loginUrl: string;
  reservationsUrl: string;
  credentials: {
    username: string;
    password: string;
  };
  telegram?: {
    botToken: string;
    chatId?: string;
  };
  options: {
    sessionTimeout: number;
    maxRetries: number;
    retryDelay: number;
  };
}