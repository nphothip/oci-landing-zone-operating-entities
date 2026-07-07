local extensions = import '../../../extensions.libsonnet';
local publication_network = import '../../../lib/publication_network.libsonnet';
local render_context = import '../../../render_context.libsonnet';
local ocvs_builder = import '../ocvs_builder.libsonnet';

function(profile, env_name='prod', platform_name='ocvs') {
  local config = profile.config,
  local ctx = render_context.from_raw_config(config),
  local n = ctx.n,
  local platform_entry = ctx.env_platform_entry(env_name, platform_name),
  local resolved = extensions.resolve_entry(
    ctx.extension_resolve_entry_inputs({ ocvs_simple: ocvs_builder }, platform_entry)
  ),
  local rendered_extension = ocvs_builder.render(resolved.render_params),
  local scope = resolved.render_params.topology,
  local plat = scope.platform_name,
  local category_key = publication_network.category_key(scope),
  local drg_key = n.key('DRG', ['HUB']),
  local route_segments = scope.key_segments + ['PLATFORM', plat],
  local vcn_key = n.key('VCN', route_segments),
  local ocvs_category =
    rendered_extension.contributions.network_pre.network_configuration.network_configuration_categories[category_key],
  local published_category =
    publication_network.network_category(ocvs_category, n) {
      non_vcn_specific_gateways+: {
        inject_into_existing_drgs+: {
          [drg_key]+: {
            drg_id: drg_key,

            drg_attachments+: {
              [n.key('DRGATT', route_segments)]: {
                display_name: n.display('drgatt', scope.name_segments + [plat]),
                drg_route_table_key: n.key('DRGRT', ['SPOKES']),

                network_details: {
                  type: 'VCN',
                  attached_resource_key: vcn_key,
                },
              },
            },
          },
        },
      },
    },

  identity: {
    compartments_configuration: {
      enable_delete: 'true',
      compartments: {
        [scope.compartment_key]: {
          name: scope.compartment_name,
          description: scope.compartment_description,
          parent_id: scope.parent_compartment_key,
        },
      },
    },
  } + rendered_extension.contributions.iam,

  network: {
    network_configuration: {
      network_configuration_categories: {
        [category_key]: published_category,
      },
    },
  },

  ocvs: rendered_extension.contributions.ocvs,
}
