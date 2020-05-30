import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { encode } from "https://deno.land/std/encoding/base64.ts";

const app = new Application();
const router = new Router();

if (Deno.args.length < 2) {
  throw new Error(`
    clientId and/or clientSecret is missing.
    Try again: deno run --allow-net --allow-read get-spotify-token.ts my-client-id my-client-secret
  `);
}

const [clientId, clientSecret, accesstoken] = Deno.args;

let token: null | {
  access_token: string;
  refresh_token?: string;
  token_type: "Bearer";
  scope: string;
  expires_in: 3600;
} = accesstoken
  ? {
      access_token: accesstoken,
      token_type: "Bearer",
      scope: "",
      expires_in: 3600,
    }
  : null;

router.get("/ping", (ctx) => {
  ctx.response.body = "pong";
});

router.get("/get-token", (ctx) => {
  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
  ].join(" ");

  ctx.response.redirect(
    [
      "https://accounts.spotify.com/authorize",
      "?response_type=code",
      `&client_id=${clientId}`,
      `&scope=${encodeURIComponent(scopes)}`,
      `&redirect_uri=${encodeURIComponent("http://localhost:8080/callback")}`,
    ].join("")
  );
});

router.get("/callback", async (ctx) => {
  const code = ctx.request.url.searchParams.get("code");
  if (!code) {
    const error = ctx.request.url.searchParams.get("error");
    ctx.throw(500, error ? decodeURIComponent(error) : "Code is missing");
    return;
  }

  try {
    const result = await fetch('https://accounts.spotify.com/api/token', {
      method: "POST",
      body: [
        "grant_type=authorization_code",
        `code=${code}`,
        `redirect_uri=${encodeURIComponent("http://localhost:8080/callback")}`,
      ].join("&"),
      headers: {
        Authorization: `Basic ${encode(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
    }).then((r) => r.json());

    token = result;
    ctx.response.body = result;
  } catch (error) {
    console.log(error);
    ctx.throw(500, error);
  }
});

router.get("/currently-playing", async (ctx) => {
  const accesstoken = token?.access_token;
  if (!accesstoken) {
    ctx.throw(400, `
      Access token is missing.
      Get a new one by go to '/get-token' or pass one as the third argument
    `);
    return;
  }

  const response = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token?.access_token}`,
      },
    }
  );

  switch (response.status) {
    case 204:
      ctx.response.body = 'Nothing is playing';
      break;
    case 200:
      ctx.response.body = await response.json();
      break;
    default:
      ctx.throw(response.status, await response.text());
      break;
  }

});

app.use(router.routes());
app.use(router.allowedMethods());

console.log('Visit http://localhost:8080');
await app.listen({ port: 8080 });
