import { check } from 'k6';
import { pickRealm, pickClient, pickUser, getTestConfig, wrapWithErrorCounting, Keycloak } from "./lib/keycloak.js";
import { randomSeed } from 'k6';

const config = getTestConfig();

export let options = {
  stages: [
    { duration: config.rampupDuration, target: config.vuCount },
    { duration: config.testDuration, target: config.vuCount },
    { duration: config.rampupDuration, target: 0 },
  ],
  noVUConnectionReuse: true,
};

randomSeed(__VU);
const realm = pickRealm(config.realmCount);
let keycloak = new Keycloak(config.keycloakURL, { offlineTokens: config.offlineTokens });

function testKCLogin() {
  let user = pickUser(realm);
  let client = pickClient(realm);
  keycloak.login(realm.id, client, user, check);
}

export default wrapWithErrorCounting(testKCLogin);
