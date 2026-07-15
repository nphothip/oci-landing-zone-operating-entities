// Shared security Vault and per-cluster OKE encryption key contribution.

local contract = import './oke_public_load_balancer.libsonnet';

function(ctx) {
  vaults_configuration+: {
    default_compartment_id: ctx.n.key_global('CMP', ['SECURITY']),

    vaults+: {
      [ctx.vault_key]: {
        name: ctx.vault_name,
      },
    },

    keys+: {
      [ctx.kube_secret_key]: {
        name: ctx.kube_secret_key_name,
        protection_mode: 'HSM',
        vault_key: ctx.vault_key,
        // The shared Vault remains in the security compartment, while each
        // cluster-specific key is created in its owning OKE platform
        // compartment. Orchestrator resolves this configuration key through
        // kms_dependency for the cluster and node-pool modules.
        compartment_id: ctx.cmp_key,
        // Retain the platform tag for inventory and governance. KMS
        // authorization is compartment-scoped and does not depend on this tag.
        defined_tags: {
          [contract.platform_tag]: ctx.platform_tag_value,
        },
      },
    },
  },
}
