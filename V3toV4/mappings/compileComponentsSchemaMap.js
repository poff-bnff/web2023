'use strict'

/* # Compile schema mapping from version 3 to version 4
  1. read existing user-curated V4schema.flat.components.json file
  2. compile schema mapping from version 3 to version 4
     and save it to ./V3V4componentsMap-generated.* files
*/

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const STRAPI3_COMPONENTSCHEMA_PATH = path.join(__dirname, 'V4schema.flat.components.json')
const componentschema = JSON.parse(fs.readFileSync(STRAPI3_COMPONENTSCHEMA_PATH, 'utf8'))
  .map(item => {
    return {
      datamodelKey: item.s3InfoName,
      kind: 'component',
      s3: {
        folderName: item.folderName,
        // apiPath: item.s3ApiPath,
        collectionName: item.v4.collectionName,
        infoName: item.s3InfoName
      },
      s4: {
        folderName: item.folderName,
        // apiPath: item.s4ApiPath,
        collectionName: item.v4.collectionName,
        info: {
          displayName: item.v4.info.displayName,
        }
      }
    }
  })
  // sort by datamodelKey
  .sort((a, b) => a.datamodelKey < b.datamodelKey ? -1 : 1)
  ;

// save to json
fs.writeFileSync(path.join(__dirname, 'V3V4componentsMap-generated.json'), JSON.stringify(componentschema, null, 2))
// also in yaml
fs.writeFileSync(path.join(__dirname, 'V3V4componentsMap-generated.yaml'), yaml.dump(componentschema))
// also in CSV
const flatModel = componentschema.map(item => {
  return {
    datamodelKey: item.datamodelKey,
    kind: item.kind,
    's3.folderName': item.s3.folderName,
    // 's3.apiPath': item.s3.apiPath,
    's3.collectionName': item.s3.collectionName,
    's3.infoName': item.s3.infoName,
    's4.folderName': item.s4.folderName,
    's4.collectionName': item.s4.collectionName,
    's4.info.displayName': item.s4.info.displayName
  }
})

const csv = require('csv-writer').createObjectCsvWriter;
const csvWriter = csv({
  path: path.join(__dirname, 'V3V4componentsMap-generated.csv'),
  header: [
    { id: 'datamodelKey', title: 'datamodelKey' },
    { id: 'kind', title: 'kind' },
    { id: 's3.folderName', title: 's3.folderName' },
    // { id: 's3.apiPath', title: 's3.apiPath' },
    { id: 's3.collectionName', title: 's3.collectionName' },
    { id: 's3.infoName', title: 's3.infoName' },
    { id: 's4.folderName', title: 's4.folderName' },
    { id: 's4.collectionName', title: 's4.collectionName' },
    { id: 's4.info.displayName', title: 's4.info.displayName' }
  ]
});
csvWriter.writeRecords(flatModel)
  .then(() => console.log('The CSV file was written successfully'));