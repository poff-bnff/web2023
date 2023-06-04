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
const STRAPI4_COMPONENT_PATH = path.join(STRAPI4_ROOT, 'strapi4', 'src', 'components')

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
    .reduce((collectionsArray, modelName) => {
      const model = JSON.parse(fs.readFileSync(path.join(STRAPI3_COLLECTIONS_PATH, modelName, 'models', `${modelName}.settings.json`), 'utf8'))
      collectionsArray.push({
        kind: model.kind,
        modelName: modelName,
        collectionName: model.collectionName,
        displayName: model.info.name,
        attributes: model.attributes
      })
      return collectionsArray
    }, []),
  components: STRAPI3_COMPONENTS
    .filter((componentCategory) => fs.statSync(path.join(STRAPI3_COMPONENTS_PATH, componentCategory)).isDirectory())
    .reduce((componentsGroupArray, componentCategory) => {
      const componentGroupPath = path.join(STRAPI3_COMPONENTS_PATH, componentCategory)
      const componentFileNames = fs.readdirSync(componentGroupPath)
      const newComponentsGroupArray = componentFileNames
        .reduce((componentsArray, componentFileName) => {
          const componentPath = path.join(componentGroupPath, `${componentFileName}`)
          const component = JSON.parse(fs.readFileSync(componentPath), 'utf8')
          const modelName = componentFileName.split('.')[0]
          componentsArray.push({
            kind: 'componentType',
            componentCategory: componentCategory,
            modelName: modelName,
            collectionName: component.collectionName,
            displayName: component.info.name,
            options: component.options,
            attributes: component.attributes
          })
          return componentsArray
        }, [])
      return componentsGroupArray.concat(newComponentsGroupArray)
    }, [])
}

const strapi4Schema = {
  collections: [],
  components: []
}

const addCollectionToS4Schema = (s3Collection) => {
  // hard copy s3Collection to s4Collection to avoid side effects
  const s4Collection = {
    kind: s3Collection.kind,
    modelName: s3Collection.modelName,
    collectionName: s3Collection.collectionName,
    displayName: s3Collection.displayName,
    s3DisplayName: s3Collection.s3DisplayName,
    attributes: s3Collection.attributes
  }
  strapi4Schema.collections.push(s4Collection)
  // console.log(`writeS4Collection: ${JSON.stringify(s3Collection, null, 2)}`)
}

const addComponentsToS4Schema = (componentNames) => {
  const addedComponentNames = []
  componentNames.forEach((componentName) => {
    // break componentName into componentCategory and modelName
    const [componentCategory, modelFileName] = componentName.split('.')
    // console.log(`addComponentToS4Schema: ${componentName}=${componentCategory}+${modelFileName}`)
    // if component already in s4Schema, skip
    if (strapi4Schema.components
      .find((component) => {
        if (!component.fileName) {
          console.log(`WARNING: component ${componentName} has no fileName`)  
          return false
        }
        if (!component.componentCategory) {
          console.log(`WARNING: component ${componentName} has no componentCategory`)  
          return false
        }
        if (component.fileName !== modelFileName) {
          // console.log(`WARNING: component with fileName '${component.fileName}' does not match modelFileName '${modelFileName}'`)
          return false
        }
        if (component.componentCategory !== componentCategory) {
          // console.log(`WARNING: component with componentCategory ${component.componentCategory} does not match componentCategory ${componentCategory}`)
          return false
        }
        return true
      })) {
      // console.log(`WARNING: component ${componentName} already in s4Schema`)
      return
    }
    // console.log(`addComponentToS4Schema: ${componentName}`, JSON.stringify(strapi4Schema.components.map((component) => `${component.componentCategory}.${JSON.stringify(component)}`), null, 2))
    // find component in s3Schema
    const s3Component = strapi3Schema.components
      .find((component) => {
        return component.modelName === modelFileName
          && component.componentCategory === componentCategory
      })
    if (!s3Component) {
      console.log(`WARNING: component ${componentName} not found in s3Schema`)
      return
    }
    // add component to s4Schema
    addComponentToS4Schema(s3Component)
    addedComponentNames.push(componentName)
  })
  return addedComponentNames
}

const addComponentToS4Schema = (s3Component) => {
  // hard copy s3Component to s4Component to avoid side effects
  const s4Component = {
    kind: s3Component.kind,
    componentCategory: s3Component.componentCategory,
    collectionName: s3Component.collectionName,
    displayName: s3Component.displayName,
    s3DisplayName: s3Component.s3DisplayName,
    fileName: s3Component.modelName,
    s4: {
      collectionName: s3Component.collectionName,
      info: {
        displayName: s3Component.displayName
      },
      options: s3Component.options,
      attributes: s3Component.attributes
    }
  }
  strapi4Schema.components.push(s4Component)
  const subComponentNames = getComponentNamesInAttributes(s3Component.attributes)
  const addedSubcomponentNames = addComponentsToS4Schema(subComponentNames)
  if (addedSubcomponentNames.length > 0) {
    // console.log(`addedSubcomponentNames to ${s3Component.modelName}: ${addedSubcomponentNames}`)
  }
}

const getComponentNamesInAttributes = (attributes) => {
  const uniqueNames = Object.keys(attributes)
    .filter((attributeName) => attributes[attributeName].type === 'component')
    .map((attributeName) => attributes[attributeName].component)
    // make it unique
    .filter((value, index, self) => self.indexOf(value) === index)
  if (uniqueNames.length > 0) {
    // console.log(`getComponentNamesInAttributes: ${JSON.stringify(uniqueNames, null, 2)}`)
  }
  return uniqueNames
}

// enrich strapi3Schema.collections with displaynames from s3datamodel
for (s3DislpayName in s3datamodel) {
  const element = s3datamodel[s3DislpayName]
  if (element._path) {
    const modelName = element._path.split('/')[1]
    const collectionName = modelName.replace(/-/g, '_')
    // console.log(`s3DislpayName: ${s3DislpayName}, modelName: ${modelName}, collectionName: ${collectionName}`)
    // find a collection in strapi3Schema.collections, where modelName or collectionName matches
    const s3Collection = strapi3Schema.collections.find((collection) => {
      return collection.modelName === modelName
        || collection.collectionName === collectionName
        || collection.displayName === s3DislpayName
    })
    if (s3Collection) {
      s3Collection.s3DisplayName = s3DislpayName
      addCollectionToS4Schema(s3Collection)
      const componentNamesInCollection = getComponentNamesInAttributes(s3Collection.attributes)
      addComponentsToS4Schema(componentNamesInCollection)
    } else {
      console.log(`WARNING: ${s3DislpayName} not found in strapi3Schema.collections`)
    }
    // console.log(`model: ${s3DislpayName}, modelName: ${modelName}, collectionName: ${collectionName}, collection: ${JSON.stringify(collection, null, 2)}`) // collection or singleType
  } else {
    // console.log(`WARNING: ${s3DislpayName} is a component`)
  }
}

fs.writeFileSync(path.join(__dirname, 'strapi3Schema.json'), JSON.stringify(strapi3Schema, null, 4))
fs.writeFileSync(path.join(__dirname, 'strapi4Schema.json'), JSON.stringify(strapi4Schema, null, 4))

// create some files for testing
let modelsCreated = 0
strapi4Schema.components.forEach((component) => {
  if (modelsCreated > 0) {
    return
  }
  const categoryName  = component.componentCategory
  const categoryPath = path.join(STRAPI4_COMPONENT_PATH, categoryName)
  if (!fs.existsSync(categoryPath)) {
    fs.mkdirSync(path.join(STRAPI4_COMPONENT_PATH, categoryName), { recursive: true }) 
  }

  const modelFileName = component.fileName
  const modelFile = path.join(categoryPath, `${modelFileName}.json`)
  if (fs.existsSync(modelFile)) {
    console.log(`WARNING: modelFile ${modelFile} already exists in category ${categoryName} for component ${component.displayName}`)
    return
  }
  console.log(`create modelFile ${modelFile} for component ${component.displayName}`) 
  fs.writeFileSync(modelFile, JSON.stringify(component.s4, null, 2))
  modelsCreated++
})
  
