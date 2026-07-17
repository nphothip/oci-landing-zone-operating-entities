// Consolidated OKE policies for scopes outside an OKE platform compartment.
//
// Policies and statement counts stay constant as platforms are added. Generated
// platform allowlists select the permitted network scope and public-LB opt-in;
// direct principal-to-target platform tag comparison prevents cross-platform
// reconciliation.

local desc = import '../../../descriptions.libsonnet';
local contract = import './oke_public_load_balancer.libsonnet';

function(contexts)
  local n = contexts[0].n;
  local permission_conditions(permissions) = [
    "request.permission = '%s'" % permission
    for permission in permissions
  ];
  local cluster_source(extra_conditions=[]) = [
    "request.principal.type = 'cluster'",
  ] + extra_conditions;
  local any_cluster_source = cluster_source();
  local platform_allowlist(platform_contexts) =
    local conditions = [
      "request.principal.compartment.tag.%s = '%s'" % [
        contract.platform_tag,
        ctx.platform_tag_value,
      ]
      for ctx in platform_contexts
    ];
    if std.length(conditions) == 1 then conditions[0]
    else "any { %s }" % std.join(', ', conditions);
  local platform_source(platform_contexts) = cluster_source([
    platform_allowlist(platform_contexts),
  ]);
  // The source allowlist and target equality are separate controls. The
  // allowlist selects platforms assigned to this network scope (or opted in to
  // the Hub public-LB scope). Equality then prevents an allowed platform from
  // reconciling another platform's existing LB, NLB, or NSG.
  local matching_target = [
    "request.principal.compartment.tag.%s = target.resource.tag.%s" % [
      contract.platform_tag,
      contract.platform_tag,
    ],
  ];
  local all_conditions(conditions) = "all { %s }" % std.join(', ', conditions);
  local lifecycle_condition(source_conditions, initial_permissions, move_permission) =
    all_conditions(source_conditions + [
      "any { %s }" % std.join(', ', permission_conditions(initial_permissions) + [
        all_conditions(matching_target + [
          "request.permission != '%s'" % move_permission,
        ]),
      ]),
    ]);
  local target_condition(source_conditions) =
    all_conditions(source_conditions + matching_target);
  // OKE CCM does not apply service_lb_config defined tags to the frontend NSG
  // it creates in NSG management mode. The spoke network compartment is
  // therefore the authorization boundary for NSG lifecycle.
  local spoke_nsg_condition(source_conditions) =
    all_conditions(source_conditions + [
      "request.permission != 'NETWORK_SECURITY_GROUP_MOVE'",
    ]);
  local network_scope_keys = std.uniq(std.sort([
    ctx.scope.network_compartment_key
    for ctx in contexts
  ]));
  local contexts_for_network(scope_key) = [
    ctx
    for ctx in contexts
    if ctx.scope.network_compartment_key == scope_key
  ];
  local scope_label(ctx) = ctx.env;
  local scope_compartment_name(ctx) = n.display_global('cmp', [ctx.env, 'network']);
  local network_policies = {
    [n.key_global('PCY', [scope_label(first), 'OKE', 'SERVICE', 'NETWORK'])]: {
      name: n.display_global('pcy', [scope_label(first), 'oke', 'service', 'network']),
      description: desc.policy.grants(
        'OKE cluster resource principals',
        'scope-allowlisted private Load Balancer, Network Load Balancer, and NSG permissions plus the VCN prerequisites for NSG lifecycle and cluster-wide private-IP use',
        'the %s network compartment' % scope_label(first)
      ),
      compartment_id: scope_key,
      local cmp_name = scope_compartment_name(first),
      local source = platform_source(scope_contexts),
      statements: [
        "allow any-user to use private-ips in compartment %s where %s" % [
          cmp_name,
          all_conditions(any_cluster_source),
        ],
        "allow any-user to manage network-security-groups in compartment %s where %s" % [
          cmp_name,
          spoke_nsg_condition(source),
        ],
        "allow any-user to manage vcns in compartment %s where %s" % [
          cmp_name,
          all_conditions(source + [
            "any { request.operation = 'CreateNetworkSecurityGroup', request.operation = 'DeleteNetworkSecurityGroup' }",
          ]),
        ],
        "allow any-user to read vcns in compartment %s where %s" % [
          cmp_name,
          all_conditions(source),
        ],
        "allow any-user to manage load-balancers in compartment %s where %s" % [
          cmp_name,
          lifecycle_condition(
            source,
            ['LOAD_BALANCER_INSPECT', 'LOAD_BALANCER_READ', 'LOAD_BALANCER_CREATE'],
            'LOAD_BALANCER_MOVE'
          ),
        ],
        "allow any-user to manage network-load-balancers in compartment %s where %s" % [
          cmp_name,
          lifecycle_condition(
            source,
            ['NETWORK_LOAD_BALANCER_INSPECT', 'NETWORK_LOAD_BALANCER_READ', 'NETWORK_LOAD_BALANCER_CREATE'],
            'NETWORK_LOAD_BALANCER_MOVE'
          ),
        ],
      ],
    }
    for scope_key in network_scope_keys
    for scope_contexts in [contexts_for_network(scope_key)]
    for first in [scope_contexts[0]]
  };
  local public_contexts = [ctx for ctx in contexts if ctx.public_load_balancer];
  local public_source = platform_source(public_contexts);
  local hub_policy = if std.length(public_contexts) == 0 then {} else {
    [n.key_global('PCY', ['OKE', 'SERVICE', 'PUBLIC-LB', 'HUB'])]: {
      name: n.display_global('pcy', ['oke', 'service', 'public-lb', 'hub']),
      description: desc.policy.grants(
        'OKE cluster resource principals',
        'opted-in public Load Balancer, Network Load Balancer, and frontend NSG permissions plus cluster-wide Hub IP permissions',
        'the Landing Zone shared Hub network boundary'
      ),
      compartment_id: n.key_global('CMP', ['NETWORK']),
      local hub_cmp = n.display_global('cmp', ['network']),
      statements: [
        "allow any-user to manage load-balancers in compartment %s where %s" % [hub_cmp, lifecycle_condition(public_source, ['LOAD_BALANCER_INSPECT', 'LOAD_BALANCER_READ', 'LOAD_BALANCER_CREATE'], 'LOAD_BALANCER_MOVE')],
        "allow any-user to manage network-load-balancers in compartment %s where %s" % [hub_cmp, lifecycle_condition(public_source, ['NETWORK_LOAD_BALANCER_INSPECT', 'NETWORK_LOAD_BALANCER_READ', 'NETWORK_LOAD_BALANCER_CREATE'], 'NETWORK_LOAD_BALANCER_MOVE')],
        // CreateLoadBalancer evaluates Hub NSG membership without exposing the
        // referenced NSG's target tags to IAM. Keep this membership-only and
        // source-allowlisted; OKE still cannot create NSGs or change rules.
        "allow any-user to use network-security-groups in compartment %s where %s" % [hub_cmp, all_conditions(public_source)],
        // Public LBs use an alternative subnet in the Hub VCN. These grants
        // permit discovery and attachment without VCN or subnet mutation.
        "allow any-user to use subnets in compartment %s where %s" % [hub_cmp, all_conditions(public_source)],
        "allow any-user to read vcns in compartment %s where %s" % [hub_cmp, all_conditions(public_source)],
        // OKE's cross-compartment reserved-IP contracts differ for LB and NLB.
        // A Service selects an existing reserved address; it does not create
        // the reservation. OCI nevertheless requires manage public-ips for the
        // NLB path, which includes broader public-IP lifecycle permissions.
        // Keep the principal-type boundary, but deliberately do not use
        // platform tags for IP access.
        "allow any-user to manage public-ips in compartment %s where %s" % [hub_cmp, all_conditions(any_cluster_source)],
        "allow any-user to use private-ips in compartment %s where %s" % [hub_cmp, all_conditions(any_cluster_source)],
        "allow any-user to manage floating-ips in compartment %s where %s" % [hub_cmp, all_conditions(any_cluster_source)],
      ],
    },
  };
  local tagging_policy = {
    [n.key_global('PCY', ['OKE', 'SERVICE', 'TAGGING'])]: {
      name: n.display_global('pcy', ['oke', 'service', 'tagging']),
      description: desc.policy.grants(
        'OKE clusters',
        'the ability to apply the Landing Zone-owned OKE platform tag to Kubernetes-created Load Balancers and Network Load Balancers',
        'the Landing Zone OKE tag namespace'
      ),
      compartment_id: 'TENANCY-ROOT',
      statements: [
        "allow any-user to use tag-namespaces in tenancy where all { request.principal.type = 'cluster', request.principal.compartment.tag.%s = '*', target.tag-namespace.name = '%s' }" % [
          contract.platform_tag,
          contract.tag_namespace,
        ],
      ],
    },
  };
  {
    policies_configuration+: {
      supplied_policies+: network_policies + hub_policy + tagging_policy,
    },
  }
