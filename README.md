# K6 scripts to run load tests against Keycloak

## Setup

```sh
sudo wget https://bintray.com/loadimpact/rpm/rpm -O /etc/yum.repos.d/bintray-loadimpact-rpm.repo
sudo yum install -y k6
```

**/tmp/statsd_exporter.yaml**:

```yaml
defaults:
  observer_type: histogram
mappings:
- match: "k6.*"
  name: "k6_${1}"
- match: "k6.check.*.*.*"
  name: "k6_check"
  labels:
    http_name: "$1"
    check_name: "$2"
    outcome: "$3"
```

```sh
sudo podman run -d --name statsd_exporter  -p 9102:9102 -p 8125:8125/udp -v /tmp/statsd_exporter.yaml:/etc/statsd_exporter.yaml quay.io/prometheus/statsd-exporter:latest --statsd.listen-udp=:8125 --statsd.mapping-config=/etc/statsd_exporter.yaml
```

**/tmp/prometheus.yaml**:

```yaml
global:
  scrape_interval:      1s
  evaluation_interval:  1s

scrape_configs:
- job_name: 'statsd_exporter'
  static_configs:
  - targets: ['statsd_exporter.dns.podman:9102']
    labels: {}
  metric_relabel_configs:
  - regex: '(job|instance)'
    action: labeldrop
```

```sh
sudo podman run -d --name prometheus -p 9090:9090 -v /tmp/prometheus.yaml:/etc/prometheus/prometheus.yml prom/prometheus
```

## Usage

```sh
export K6_DATADOG_TAG_BLACKLIST="url"
k6 run -o datadog login.js
```

