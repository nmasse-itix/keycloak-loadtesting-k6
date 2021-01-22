import { Rate } from "k6/metrics";

export function pickRealm(realmCount) {
    var realmId = __VU % realmCount;
    realmId = `${realmId}`.padStart(3, "0");
    var fileName = `data/realm-${realmId}.json`;
    return JSON.parse(open(fileName));
}

export function pickClient(realm) {
    var clients = realm.clients;
    if (clients == null || clients.length == 0) {
        return null;
    }

    var i = Math.floor(Math.random() * Math.floor(clients.length));
    return clients[i];
}

export function pickUser(realm) {
    var users = realm.users;
    if (users == null || users.length == 0) {
        return null;
    }

    var i = Math.floor(Math.random() * Math.floor(users.length));
    return users[i];
}

export var script_errors = Rate("script_errors");
export function wrapWithErrorCounting(fn) {
  return () => {
    try {
      fn();
      script_errors.add(0);
    } catch (e) {
      script_errors.add(1);
      throw e;
    }
  }
}

export function buildQueryString(data) {
  const result = [];

  Object.keys(data)
   .forEach((key) => {
      const encode = encodeURIComponent;
      result.push(encode(key) + "=" + encode(data[key]));
  });

  return result.join("&");
}
