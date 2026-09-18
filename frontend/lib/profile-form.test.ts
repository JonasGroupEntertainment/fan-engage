import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INITIAL_PROFILE_FORM_STATE,
  profileValuesFromFan,
  readProfileFormValues,
  rejectedProfileSubmit,
} from "./profile-form.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(join(import.meta.dirname, relFromLib), "utf8");
}

describe("readProfileFormValues", () => {
  it("returns every field trimmed, with blanks as empty strings", () => {
    const fd = new FormData();
    fd.set("firstName", "  Kevin ");
    fd.set("lastName", "Jonas");
    fd.set("city", " Nashville, TN");
    fd.set("phone", "615 555 0123 ");
    fd.set("interest", "");
    fd.set("instagramOrTiktok", "@kevin");

    const values = readProfileFormValues(fd);

    assert.deepEqual(values, {
      firstName: "Kevin",
      lastName: "Jonas",
      city: "Nashville, TN",
      phone: "615 555 0123",
      interest: "",
      musicOutlet: "",
      instagramOrTiktok: "@kevin",
      avatarUrl: "",
    });
  });
});

describe("profileValuesFromFan", () => {
  it("maps a fans row, including the nested social handle", () => {
    const values = profileValuesFromFan({
      first_name: "Kevin",
      last_name: null,
      city: "Nashville, TN",
      phone: "+16155550123",
      interest: null,
      music_outlet: "Spotify",
      socials: { instagram_or_tiktok: "@kevin", other: "x" },
      avatar_url: "https://cdn.example/a.jpg",
    });

    assert.deepEqual(values, {
      firstName: "Kevin",
      lastName: "",
      city: "Nashville, TN",
      phone: "+16155550123",
      interest: "",
      musicOutlet: "Spotify",
      instagramOrTiktok: "@kevin",
      avatarUrl: "https://cdn.example/a.jpg",
    });
  });

  it("returns all-empty values when there is no row yet", () => {
    const values = profileValuesFromFan(null);
    assert.equal(Object.values(values).every((v) => v === ""), true);
  });

  it("starts with no error and no submitted values", () => {
    assert.deepEqual(INITIAL_PROFILE_FORM_STATE, { error: null, attempt: 0 });
  });
});

describe("rejectedProfileSubmit", () => {
  it("echoes the submitted values and bumps the attempt counter each time", () => {
    const values = profileValuesFromFan(null);
    const first = rejectedProfileSubmit(INITIAL_PROFILE_FORM_STATE, "phone", "bad", values);
    const second = rejectedProfileSubmit(first, "save", "down", values);

    assert.deepEqual(first, { error: "phone", message: "bad", values, attempt: 1 });
    assert.deepEqual(second, { error: "save", message: "down", values, attempt: 2 });
  });
});

describe("profile form keeps unsaved edits when the server rejects the phone", () => {
  it("action returns an error state with the submitted values instead of redirecting", () => {
    const action = readRepo("../app/me/profile/actions.ts");
    assert.match(action, /readProfileFormValues\(formData\)/);
    assert.match(action, /rejectedProfileSubmit\(prevState, "phone"/);
    assert.match(action, /rejectedProfileSubmit\(prevState, "save"/);
    assert.doesNotMatch(action, /\?error=phone/);
  });

  it("form is a client component that re-renders from the returned values", () => {
    const form = readRepo("../app/me/profile/profile-form.tsx");
    assert.match(form, /^"use client";/);
    assert.match(form, /useActionState\(\s*updateProfileAction,\s*INITIAL_PROFILE_FORM_STATE,?\s*\)/);
    assert.match(form, /<form key=\{state\.attempt\}/);
    assert.match(form, /defaultValue=\{values\.firstName\}/);
    assert.match(form, /defaultValue=\{values\.phone\}/);
    assert.match(form, /defaultValue=\{values\.instagramOrTiktok\}/);
    assert.match(form, /pattern=\{PHONE_INPUT_PATTERN\}/);
    assert.match(form, /role="alert"/);
    assert.match(form, /state\.error === "phone"/);
    assert.match(form, /id="phone-error"/);
    assert.match(form, /"phone-error phone-hint"/);
  });

  it("page hands the DB row to the form and no longer reads an error from the URL", () => {
    const page = readRepo("../app/me/profile/page.tsx");
    assert.match(page, /profileValuesFromFan\(fan\)/);
    assert.match(page, /<ProfileForm/);
    assert.doesNotMatch(page, /searchParams/);
  });
});
