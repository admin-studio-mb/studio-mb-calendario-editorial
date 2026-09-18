/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user: { id: string; email: string; first_name?: string; last_name?: string; role?: string } | null;
    token: string | null;
  }
}
