export const env = {};

export class DurableObject<Env = unknown> {
  protected readonly env: Env;
  protected readonly ctx: unknown;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
