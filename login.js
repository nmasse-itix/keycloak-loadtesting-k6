import { check } from 'k6';
import { pickRealm, pickClient, pickUser, getTestConfig, wrapWithErrorCounting, Keycloak } from "./lib/keycloak.js";
import { randomSeed } from 'k6';

export let options = {
  stages: [
    { duration: "20s", target: 5 },
    { duration: "2m", target: 300 }
  ],
  noVUConnectionReuse: true,
};

const config = getTestConfig();

randomSeed(__VU);
const realm = pickRealm(config.realmCount);
let keycloak = new Keycloak(config.keycloakURL, { offlineTokens: config.offlineTokens });

function testKCLogin() {
  let user = pickUser(realm);
  let client = pickClient(realm);
  keycloak.login(realm.id, client, user, check);
}

export default wrapWithErrorCounting(testKCLogin);
