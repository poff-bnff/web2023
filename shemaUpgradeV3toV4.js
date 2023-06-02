'use strinct'

const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')
const readline = require('readline')

const STRAPI3_ROOT = path.join(__dirname, '..', 'web2021')
const STRAPI3_COLLECTIONS_PATH = path.join(STRAPI3_ROOT, 'strapi', 'strapi-development', 'api')
const STRAPI3_COLLECTIONS = fs.readdirSync(STRAPI3_COLLECTIONS_PATH)
const STRAPI3_COMPONENTS_PATH = path.join(STRAPI3_ROOT, 'strapi', 'strapi-development', 'components')
const STRAPI3_COMPONENTS = fs.readdirSync(STRAPI3_COMPONENTS_PATH)
const STRAPI3_DATAMODEL = path.join(STRAPI3_ROOT, 'ssg', 'docs', 'datamodel.yaml')

const STRAPI4_ROOT = path.join(__dirname, '..', 'web2023')
const STRAPI4_API_PATH = path.join(STRAPI4_ROOT, 'strapi4', 'src', 'api')

// read strapi3 datamodel.yaml, where all relevant collections
// are listed and hierarchically organized
const s3datamodel = yaml.load(fs.readFileSync(STRAPI3_DATAMODEL, 'utf8'))

const strapi3Schema = {
  collections: STRAPI3_COLLECTIONS
    .filter((modelName) => fs.statSync(path.join(STRAPI3_COLLECTIONS_PATH, modelName)).isDirectory())
    .filter((modelName) => {
      if (fs.existsSync(path.join(STRAPI3_COLLECTIONS_PATH, modelName, 'models', `${modelName}.settings.json`))) {
        return true
      }
      // console.log(`WARNING: ${modelName} has no settings.json`)
      return false
    })
    .reduce((obj, modelName) => {
      const model = JSON.parse(fs.readFileSync(path.join(STRAPI3_COLLECTIONS_PATH, modelName, 'models', `${modelName}.settings.json`), 'utf8'))
      obj.push({
        kind: model.kind,
        modelName: modelName,
        collectionName: model.collectionName,
        displayName: model.info.name
      })
      return obj
    }, []),
  components: STRAPI3_COMPONENTS
    .filter((componentGroupName) => fs.statSync(path.join(STRAPI3_COMPONENTS_PATH, componentGroupName)).isDirectory())
    .reduce((componentsGroupObj, componentGroupName) => {
      const componentGroupPath = path.join(STRAPI3_COMPONENTS_PATH, componentGroupName)
      const componentFileNames = fs.readdirSync(componentGroupPath)
      componentsGroupObj[componentGroupName] = componentFileNames.reduce((componentsObj, componentFileName) => {
        const componentPath = path.join(componentGroupPath, `${componentFileName}`)
        const component = JSON.parse(fs.readFileSync(componentPath), 'utf8')
        componentsObj[componentFileName] = {
          kind: 'componentType',
          modelName: componentFileName,
          collectionName: component.collectionName,
          displayName: component.info.name
        }
        return componentsObj
      }, {})
      return componentsGroupObj
    }, {})
}

fs.writeFileSync(path.join(__dirname, 'strapi3Schema.json'), JSON.stringify(strapi3Schema, null, 4))

const strapi4Schema = {
  collections: {},
  components: {}
}

for (key in s3datamodel) {
  const element = s3datamodel[key]
  if (element._path) {
    const modelName = element._path.split('/')[1]
    const collectionName = modelName.replace(/-/g, '_')
    // find a collection in strapi3Schema.collections, where modelName or collectionName matches
    const collection = strapi3Schema.collections.find((collection) => {
      return collection.modelName === modelName
        || collection.collectionName === collectionName
        || collection.displayName === key
    })
    console.log(`model: ${key}, modelName: ${modelName}, collectionName: ${collectionName}, collection: ${JSON.stringify(collection, null, 2)}`) // collection or singleType
  } else {
    console.log(`component: ${key}`)
  }
}