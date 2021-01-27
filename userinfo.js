import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { pickRealm, pickClient, pickUser, wrapWithErrorCounting, keycloakEndpoints, keycloakLogin, keycloakRefreshTokens } from "./lib/keycloak.js";
import { randomSeed } from 'k6';

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

function testKCUserInfo() {
  if (tokens == null) {
    tokens = keycloakLogin(endpoints, client, user, ()=>{});
  }

  for (;;) {
    let userinfo = http.get(endpoints.userinfo, { "headers": { "Authorization": `Bearer ${tokens.access_token}`}, "tags": { name: "userinfo" } });
    if (userinfo.status === 401) {
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

    check(userinfo, {
      'userinfo.status == 200': (http) => http.status === 200,
    });
    break;
  }

  sleep(.05);
}

export default wrapWithErrorCounting(testKCUserInfo);
