import { type Page, expect } from "@playwright/test";
export class ControlPage {
  constructor(readonly page: Page) {}
  async login(username: string, password: string) {
    await this.page.goto("/");
    await this.page.getByLabel("Username").fill(username);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in →" }).click();
    await expect(
      this.page.getByRole("heading", {
        name: "Every instance. One control center.",
      }),
    ).toBeVisible();
  }
  async library() {
    await this.page.getByRole("button", { name: "▧ Game library" }).click();
  }
  async create(name: string) {
    await this.page
      .getByRole("button", { name: "＋ Create instance" })
      .first()
      .click();
    await this.page.getByLabel("Instance name", { exact: true }).fill(name);
    await this.page
      .locator(".modal")
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
    await expect(
      this.page.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
}
