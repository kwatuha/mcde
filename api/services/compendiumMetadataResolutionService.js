const { createImportMetadataResolutionService } = require('./importMetadataResolutionService');

module.exports = createImportMetadataResolutionService({
  resolutionTable: 'compendium_metadata_resolutions',
  stagingTable: 'compendium_project_import_staging',
  getStagingService: () => require('./compendiumProjectImportStagingService'),
});
