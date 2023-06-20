'use strinct'

const {
  STRAPI3_COLLECTIONS_PATH,
  STRAPI3_COMPONENTS_PATH,

  STRAPI4_API_PATH,
  STRAPI4_COMPONENT_PATH,

  STRAPI3_DATAMODEL_PATH
} = require('./paths.js')

const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')

// read strapi3 datamodel.yaml, where all relevant collections
// are listed and hierarchically organized
const s3datamodel = yaml.load(fs.readFileSync(STRAPI3_DATAMODEL_PATH, 'utf8'))
// add s3 key names to each collection
Object.keys(s3datamodel).forEach(key => {
  s3datamodel[key].s3datamodelKey = key
})

const s3DatamodelPathToCollectionName = (s3DatamodelPath) =>
  s3DatamodelPath.replace(/-/g, '_').split('/')[1]

// by "relevant" we mean collections that are present in the curated datamodel.yaml file
// collection name is the table name in the database, also part of the path in api calls
// folder name is different from the table name (e.g. "bruno-menu" vs "bruno_menu")
// folder name: "tag-category"
// collection name (table name): "tag_categories"
// keyname in s3datamodel: "TagCategory"
// _path in s3datamodel: "/tag-categories"
const relevantCollectionNames = Object.keys(s3datamodel)
  .map(s3DatamodelKey => s3datamodel[s3DatamodelKey])
  .filter(model => model._path)
  .map(model => s3DatamodelPathToCollectionName(model._path))

// check if collection is present in curated datamodel.yaml file
const isCollectionRelevant = (collectionName) => relevantCollectionNames.includes(collectionName)

const relevantCollectionsWithKeys = Object.keys(s3datamodel)
  .map(datamodelKey => {
    return {
      datamodelKey: datamodelKey,
      s3datamodel: s3datamodel[collectionName]
    }
  })
  .filter(collectionWithKey => collectionWithKey.s3datamodel._path)
  .map(collectionWithKey => {
    collectionWithKey._path = s3datamodel[datamodelKey]._path.replace(/-/g, '_').split('/')[1]
    return collectionWithKey
  })


const relevantS3Collections = Object.keys(s3datamodel)
  .map(collectionName => {
    return s3datamodel[collectionName]
  })
  .filter(collection => collection._path)
  .map(collection => collection._path.replace(/-/g, '_').split('/')[1])


const isModelPathRelevant = (modelName) => {
  const s3model_path = path.join(STRAPI3_COLLECTIONS_PATH, modelName, 'models', `${modelName}.settings.json`)
  const s3model = yaml.load(fs.readFileSync(s3model_path, 'utf8'))
  if (isCollectionRelevant(s3model.collectionName)) {
    return true
  }
  if (s3model.info.name in s3datamodel) {
    return true
  }
  return false
}

// pluralize. also make kebab-case
const pluralize = (singular) => {
  const kebab = singular.toLowerCase().replace(/_/g, '-')
  if (kebab.endsWith('s')) {
    return `${kebab}es`
  }
  if (kebab.endsWith('y')) {
    return `${kebab.slice(0, -1)}ies`
  }
  return `${kebab}s`
}

module.exports = {
  s3datamodel,
  relevantCollectionNames,
  isCollectionRelevant,
  isModelPathRelevant,
  pluralize,
}