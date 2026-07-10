// CIS1 OKE uses the top-level CIS selector and omits Vault and CMEK references.
local lz = import 'gen/landing_zone.libsonnet';
local result = lz({
  cis_level: 1,
  hub: {
    kind: 'hub_e',
    network: { vcn: '10.0.0.0/21' },
  },
  environments: {
    prod: {
      platforms: {
        oke: {
          network: { vcn: '10.0.80.0/20' },
          extension: {
            type: 'oke_simple',
            params: {
              kubernetes_version: 'v1.35.2',
              services_cidr: '10.96.0.0/16',
              api_endpoint_allowed_cidrs: ['10.0.1.0/24'],
            },
          },
        },
      },
    },
    preprod: {
      platforms: {
        oke: {
          network: { vcn: '10.0.96.0/20' },
          extension: {
            type: 'oke_simple',
            params: {
              kubernetes_version: 'v1.35.2',
              services_cidr: '10.97.0.0/16',
              api_endpoint_allowed_cidrs: ['10.0.1.0/24'],
            },
          },
        },
      },
    },
  },
});
local clusters = result.extra.oke_clusters.oke_clusters_configuration.clusters;
local workers = result.extra.oke_workers.oke_workers_configuration.node_pools;
local policies = result.iam.policies_configuration.supplied_policies;
local security_policy = policies['PCY-LZ-OKE-SERVICE-SECURITY-KEY'];
local key_statements = [
  statement
  for statement in security_policy.statements
  if std.length(std.findSubstr(' keys ', statement)) > 0 ||
     std.length(std.findSubstr(' key-delegate ', statement)) > 0
];

{
  cluster_cis_levels: {
    [key]: clusters[key].cis_level
    for key in std.objectFields(clusters)
  },
  cluster_encryption_present: {
    [key]: std.objectHas(clusters[key], 'encryption')
    for key in std.objectFields(clusters)
  },
  worker_cis_levels: {
    [key]: workers[key].cis_level
    for key in std.objectFields(workers)
  },
  worker_encrypt_in_transit: {
    [key]: workers[key].node_config_details.encryption.enable_encrypt_in_transit
    for key in std.objectFields(workers)
  },
  worker_kms_key_present: {
    [key]: std.objectHas(workers[key].node_config_details.encryption, 'kms_key_id')
    for key in std.objectFields(workers)
  },
  cis1_vaults_configuration_present:
    std.objectHas(result.security_cis1, 'vaults_configuration'),
  key_permission_statements: key_statements,
}
