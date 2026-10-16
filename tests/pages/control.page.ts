import { type Page, expect } from "@playwright/test";
export class ControlPage {
  constructor(readonly page: Page) {}
  async login(username: string, password: string) {
    await this.page.goto("/");
    await this.page.getByLabel("Tài khoản").fill(username);
    await this.page.getByLabel("Mật khẩu").fill(password);
    await this.page.getByRole("button", { name: "Đăng nhập →" }).click();
    await expect(
      this.page.getByRole("heading", {
        name: "Mọi instance. Một nơi điều khiển.",
      }),
    ).toBeVisible();
  }
  async library() {
    await this.page.getByRole("button", { name: "▧ Thư viện game" }).click();
  }
  async create(name: string) {
    await this.page
      .getByRole("button", { name: "＋ Tạo instance" })
      .first()
      .click();
    await this.page.getByLabel("Tên instance", { exact: true }).fill(name);
    await this.page
      .locator(".modal")
      .getByRole("button", { name: "Tạo instance", exact: true })
      .click();
    await expect(
      this.page.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
}
