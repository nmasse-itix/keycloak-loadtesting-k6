import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { pickRealm, pickClient, pickUser, wrapWithErrorCounting, keycloakLogin, keycloakEndpoints } from "./lib/keycloak.js";
import { randomSeed } from 'k6';

export let options = {
  stages: [
    { duration: "20s", target: 5 },
    { duration: "1m", target: 100 }
  ],
  noVUConnectionReuse: true,
};

randomSeed(__VU);

const realmCount = 10;
const realm = pickRealm(realmCount);
const realmId = realm.id;

let endpoints = keycloakEndpoints("http://hp-microserver.itix.fr/auth", realmId);

function testKCLogin() {
  group('login', () => {
    let user = pickUser(realm);
    let client = pickClient(realm);
    keycloakLogin(endpoints, client, user, check);
  });

  sleep(2);
}

export default wrapWithErrorCounting(testKCLogin);

