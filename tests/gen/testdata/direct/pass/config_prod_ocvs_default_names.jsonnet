// Default OCVS names stay inside OCI service limits
local multi = import 'gen/landing_zone_multi.jsonnet';
local outputs = multi({
  hub: { kind: 'hub_e', network: { vcn: '10.0.0.0/21' } },
  environments: {
    prod: {
      platforms: {
        ocvs: {
          network: { vcn: '10.0.80.0/21' },
          extension: {
            type: 'ocvs_simple',
            params: {
              ssh_authorized_keys: 'ssh-rsa AAAAocvsfixture',
              cluster: {
                service_label: 'prod-ocvs',
                vmware_software_version: '7.0 update 3',
                compute_availability_domain: '1',
                esxi_hosts_count: 3,
                vsphere_type: 'MANAGEMENT',
                initial_host_ocpu_count: 52,
                initial_host_shape_name: 'BM.DenseIO2.52',
              },
            },
          },
        },
      },
    },
  },
});
local cluster =
  outputs['ocvs.json'].ocvs_configuration.ocvs_clusters['SDDC-FRA-LZ-PROD-OCVS-KEY'];
assert std.length(cluster.sddc_display_name) <= 16;
assert std.length(cluster.cluster_display_name) <= 22;
{
  sddc_display_name: cluster.sddc_display_name,
  cluster_display_name: cluster.cluster_display_name,
}
