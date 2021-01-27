import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { pickRealm, pickClient, pickUser, wrapWithErrorCounting, keycloakEndpoints, keycloakLogin, keycloakRefreshTokens } from "./lib/keycloak.js";
import { randomSeed } from 'k6';
import encoding from 'k6/encoding';

export let options = {
  stages: [
    { duration: "20s", target: 5 },
    { duration: "2m", target: 300 }
  ],
};

randomSeed(__VU);

const realmCount = 10;
const realm = pickRealm(realmCount);
const realmId = realm.id;

let user = pickUser(realm);
let client = pickClient(realm);
let endpoints = keycloakEndpoints("http://hp-microserver.itix.fr/auth", realmId);

let tokens;

function testKCTokenInfo() {
  if (tokens == null) {
    tokens = keycloakLogin(endpoints, client, user, ()=>{});
  }

  for (;;) {
    let body = {
      "token": tokens.access_token
    };
    let credentials = encoding.b64encode(`${client.clientId}:${client.secret}`);
    let tokeninfo = http.post(endpoints.tokeninfo, body, { "headers": { "Authorization": `Basic ${credentials}`}, "tags": { name: "tokeninfo" } });
    if (tokeninfo.status === 401) {
      try {
        console.log("Renewing access_token...")
        tokens = keycloakRefreshTokens(endpoints, tokens, client, ()=>{});
        break;
      } catch (e) {
        try {
          console.log("Logging-in...")
          tokens = keycloakLogin(endpoints, client, user, ()=>{});
          break;
        } catch (e) {
          throw e;
        }
      }
    }

    check(tokeninfo, {
      'tokeninfo.status == 200': (http) => http.status === 200,
    });
    break;
  }

  sleep(.05);
}

export default wrapWithErrorCounting(testKCTokenInfo);
