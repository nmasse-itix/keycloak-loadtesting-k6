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

function testKCRefreshToken() {
  if (tokens == null) {
    tokens = keycloakLogin(endpoints, client, user, ()=>{});
  }

  tokens = keycloakRefreshTokens(endpoints, tokens, client, check);
  sleep(.05);
}

export default wrapWithErrorCounting(testKCRefreshToken);
