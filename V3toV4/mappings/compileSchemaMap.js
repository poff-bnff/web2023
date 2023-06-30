'use strict'

/* # Compile schema mapping from version 3 to version 4
  1. read existing user-curated datamodel.yaml file
  2. read existing Strapi 3 folder structure
  3. compile schema mapping from version 3 to version 4
     and save it to ./schemaMap.yaml file
*/

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const STRAPI3_ROOT = path.join(__dirname, '..', '..', '..', 'web2021')
const STRAPI3_COLLECTIONS_PATH = path.join(STRAPI3_ROOT, 'strapi', 'strapi-development', 'api')

const STRAPI3_DATAMODEL_PATH = path.join(__dirname, 'datamodel.yaml')
const datamodel = yaml.load(fs.readFileSync(STRAPI3_DATAMODEL_PATH, 'utf8'))

// pluralize. also make kebab-case
const pluralize = (singular) => {
  const kebab = singular.toLowerCase().replace(/_/g, '-')
  if (kebab.endsWith('s')) {
    // return `${kebab}`
    return `${kebab}es`
  }
  if (kebab.endsWith('y')) {
    return `${kebab.slice(0, -1)}ies`
  }
  return `${kebab}s`
}

const matchCollectionType = (relevantModel, v3Model) => {
  return relevantModel.s3.collectionNameFromDatamodelPath === v3Model.collectionName
    || relevantModel.datamodelKey === v3Model.info.name
}

const s3DatamodelPathToCollectionName = (s3DatamodelPath) =>
  s3DatamodelPath.replace(/-/g, '_').split('/')[1]


const relevantCollectionTypes = Object.keys(datamodel)
  .map(key => {
    // if ( key === 'Product' ) console.log(datamodel[key])
    return { key: key, model: datamodel[key] }
  })
  .filter(item => item.model._path)
  .map(item => {
    const collectionName = s3DatamodelPathToCollectionName(item.model._path)
    return {
      datamodelKey: item.key,
      s3: {
        collectionNameFromDatamodelPath: collectionName
      },
      isFound: false
    }
  })
  // sort by datamodelKey
  .sort((a, b) => a.datamodelKey < b.datamodelKey ? -1 : 1)
  ;

// 1.2. Read actual models from Strapi 3 folder structure
// 1.2.1. Read collection types from /api folder
const V3CollectionTypes = fs.readdirSync(STRAPI3_COLLECTIONS_PATH)
  // keep only directories
  .filter(item => fs.statSync(path.join(STRAPI3_COLLECTIONS_PATH, item)).isDirectory())
  // if model has no settings.json, it is not relevant
  .filter(item => fs.existsSync(path.join(STRAPI3_COLLECTIONS_PATH, item, 'models', `${item}.settings.json`)))
  // if model has no routes.json, it is not relevant
  .filter(item => fs.existsSync(path.join(STRAPI3_COLLECTIONS_PATH, item, 'config', 'routes.json')))
  // map file name to actual description from settings.json
  .map(item => {
    const settings = JSON.parse(fs.readFileSync(path.join(STRAPI3_COLLECTIONS_PATH, item, 'models', `${item}.settings.json`), 'utf8'))
    const routes = require(path.join(STRAPI3_COLLECTIONS_PATH, item, 'config', 'routes.json'))
    settings.s3ApiPath = routes.routes[0].path
    settings.folderName = item
    return settings
  })
  // model has to be in the list of relevant models
  .filter(item => relevantCollectionTypes.find(relevantModel => matchCollectionType(relevantModel, item)))

  ; // TODO: this semicolon is required. Why?

// mark as found and populate with kind and s3* attributes
V3CollectionTypes.forEach(item => {
  const relevantCollection = relevantCollectionTypes
    .find(collType => matchCollectionType(collType, item))
  // console.log(`INFO 1.1: Found collection type ${item.collectionName} as relevant: ${relevantCollection !== undefined}`)
  delete relevantCollection.isFound
  relevantCollection.s3.folderName = item.folderName
  relevantCollection.s3.apiPath = item.s3ApiPath
  relevantCollection.s3.infoName = item.info.name
  relevantCollection.s3.collectionName = item.collectionName
})

// log out the ones that are not of kind collectionType or singleType
V3CollectionTypes.forEach(item => {
  if (item.kind !== 'collectionType' && item.kind !== 'singleType') {
    console.log(`WARNING 1.2: Collection type ${item.s3.datamodelKey} is not of kind collectionType`)
  }
})

// log out the ones that are not found
relevantCollectionTypes.forEach(item => {
  if (item.isFound === false) {
    console.log(`WARNING 1.1: Collection type ${item.s3.datamodelKey} is not found in Strapi 3 folder structure`)
  }
})

// Save to ./RelevantCollectionTypes.json for sanity check
// fs.writeFileSync(path.join(__dirname, 'datamodelCollections.json'), JSON.stringify(relevantCollectionTypes, null, 2))

// Transform collection types to Strapi 4 format
// - Add v3 and v4 api paths to the collection type
relevantCollectionTypes.forEach(item => {
  // Transfer to transformers
  // transformer.relevantCollectionType = item
  // item.s3ApiPath = `/${pluralize(item.folderName)}`
  item.s4 = {
    apiPath: `/api/${pluralize(item.s3.folderName)}`,
    collectionName: item.s3.collectionName,
    info: {
      singularName: item.s3.folderName,
      pluralName: pluralize(item.s3.folderName),
      displayName: item.datamodelKey
    }
  }
})
fs.writeFileSync(path.join(__dirname, 'V3V4map-generated.json'), JSON.stringify(relevantCollectionTypes, null, 2))
// also in yaml
fs.writeFileSync(path.join(__dirname, 'V3V4map-generated.yaml'), yaml.dump(relevantCollectionTypes))
// also in CSV
const flatModel = relevantCollectionTypes.map(item => {
  return {
    datamodelKey: item.datamodelKey,
    's3.folderName': item.s3.folderName,
    's3.apiPath': item.s3.apiPath,
    's3.collectionName': item.s3.collectionName,
    's3.infoName': item.s3.infoName,
    's4.apiPath': item.s4.apiPath,
    's4.collectionName': item.s4.collectionName,
    's4.info.singularName': item.s4.info.singularName,
    's4.info.pluralName': item.s4.info.pluralName,
    's4.info.displayName': item.s4.info.displayName
  }
})

const csv = require('csv-writer').createObjectCsvWriter;
const csvWriter = csv({
  path: path.join(__dirname, 'V3V4map-generated.csv'),
  header: [
    { id: 'datamodelKey', title: 'datamodelKey' },
    { id: 's3.folderName', title: 's3.folderName' },
    { id: 's3.apiPath', title: 's3.apiPath' },
    { id: 's3.collectionName', title: 's3.collectionName' },
    { id: 's3.infoName', title: 's3.infoName' },
    { id: 's4.apiPath', title: 's4.apiPath' },
    { id: 's4.collectionName', title: 's4.collectionName' },
    { id: 's4.info.singularName', title: 's4.info.singularName' },
    { id: 's4.info.pluralName', title: 's4.info.pluralName' },
    { id: 's4.info.displayName', title: 's4.info.displayName' }
  ]
});
csvWriter.writeRecords(flatModel)
  .then(() => console.log('The CSV file was written successfully'));