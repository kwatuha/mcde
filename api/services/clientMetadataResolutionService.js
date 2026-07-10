const { createImportMetadataResolutionService } = require('./importMetadataResolutionService');

module.exports = createImportMetadataResolutionService({
  resolutionTable: 'client_metadata_resolutions',
  stagingTable: 'client_project_import_staging',
  getStagingService: () => require('./clientProjectImportStagingService'),
});
