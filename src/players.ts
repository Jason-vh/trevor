export interface Player {
  name: string;
  squashCityUserId: string;
  email: string;
}

// Players booked alongside the account owner (player slot 2, 3, ...).
// The account owner (player 1) is always assumed.
export const PLAYERS: Player[] = [{ name: "Amp Varavarn", squashCityUserId: "1280498", email: "ampthanapa@gmail.com" }];
