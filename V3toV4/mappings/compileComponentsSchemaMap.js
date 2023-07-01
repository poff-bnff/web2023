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
        fileName: item.componentName,
        collectionName: item.v4.collectionName,
        displayName: item.s3InfoName
      },
      s4: {
        folderName: item.folderName,
        fileName: item.componentName,
        collectionName: item.v4.collectionName,
        displayName: item.s3InfoName
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
    's3.fileName': item.s3.fileName,
    's3.collectionName': item.s3.collectionName,
    's3.displayName': item.s3.displayName,
    's4.folderName': item.s4.folderName,
    's4.fileName': item.s4.fileName,
    's4.collectionName': item.s4.collectionName,
    's4.displayName': item.s4.displayName
  }
})

const csv = require('csv-writer').createObjectCsvWriter;
const csvWriter = csv({
  path: path.join(__dirname, 'V3V4componentsMap-generated.csv'),
  header: [
    { id: 'datamodelKey', title: 'datamodelKey' },
    { id: 'kind', title: 'kind' },
    { id: 's3.folderName', title: 's3.folderName' },
    { id: 's3.fileName', title: 's3.fileName' },
    { id: 's3.collectionName', title: 's3.collectionName' },
    { id: 's3.displayName', title: 's3.displayName' },
    { id: 's4.folderName', title: 's4.folderName' },
    { id: 's4.fileName', title: 's4.fileName' },
    { id: 's4.collectionName', title: 's4.collectionName' },
    { id: 's4.displayName', title: 's4.displayName' }
  ]
});
csvWriter.writeRecords(flatModel)
  .then(() => console.log('The CSV file was written successfully'));