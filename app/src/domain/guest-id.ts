const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * The guest id is a random UUID the server mints into an httpOnly cookie. It is a bearer secret: whoever holds it
 * can read that gallery. Requiring the UUID shape keeps guessable ids ("aaaaaaaaaaaaaaaa") out. Nothing binds an id
 * to a cookie on the Convex side, so a global upload limit backs up the per-guest one.
 */
export class GuestId {
  static isValid(id: string): boolean {
    return UUID.test(id)
  }
}
