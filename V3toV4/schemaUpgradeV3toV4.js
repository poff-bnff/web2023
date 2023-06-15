'use strinct'

const path = require('path')
const fs = require('fs')

const {
  STRAPI3_COLLECTIONS_PATH,
  STRAPI3_COMPONENTS_PATH,

  STRAPI4_API_PATH,
  STRAPI4_COMPONENT_PATH,
} = require('./paths.js')

const {
  s3datamodel,
  isCollectionRelevant,
  isModelPathRelevant,
  pluralize,
} = require('./common.js')

const discardedModelNames = []
const S_3_COLLECTIONS = fs.readdirSync(STRAPI3_COLLECTIONS_PATH)
  .filter((modelName) => { // keep only directories
    if (fs.statSync(path.join(STRAPI3_COLLECTIONS_PATH, modelName)).isDirectory()) {
      return true
    }
    return false
  })
  .filter((modelName) => { // if model has no settings.json, it is not relevant
    if (fs.existsSync(path.join(STRAPI3_COLLECTIONS_PATH, modelName, 'models', `${modelName}.settings.json`))) {
      return true
    }
    return false
  })
  .filter((modelName) => { // if model is not listed in datamodel.yaml, it is not relevant
    if (isModelPathRelevant(modelName)) {
      return true
    }
    discardedModelNames.push(modelName)
    return false
  })
  .map((modelName) => { // convert model name to collection
    const model = JSON.parse(fs.readFileSync(path.join(STRAPI3_COLLECTIONS_PATH, modelName, 'models', `${modelName}.settings.json`), 'utf8'))
    return {
      kind: model.kind,
      modelName: modelName,
      collectionName: model.collectionName,
      displayName: model.info.name,
      attributes: model.attributes
    }
  })
console.log(`INFO 1: ${discardedModelNames.length} models discarded: ${discardedModelNames.join(', ')}`)

const S_3_COMPONENTS = fs.readdirSync(STRAPI3_COMPONENTS_PATH)
  .filter((componentCategory) => fs.statSync(path.join(STRAPI3_COMPONENTS_PATH, componentCategory)).isDirectory())
  .reduce((componentsGroupArray, componentCategory) => {
    const componentGroupPath = path.join(STRAPI3_COMPONENTS_PATH, componentCategory)
    const componentFileNames = fs.readdirSync(componentGroupPath)
    const newComponentsGroupArray = componentFileNames
      .reduce((componentsArray, componentFileName) => {
        const componentPath = path.join(componentGroupPath, `${componentFileName}`)
        // console.log(`reading ${componentPath}`)
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
      .filter((component) => { // if component has relations to collections that are not relevant, it is not relevant
        // if (component.attributes) {
        const irrelevantAttributes = Object.keys(component.attributes || {})
          .filter((attributeName) => {
            const attribute = component.attributes[attributeName]
            if ('collection' in attribute && attribute.collection !== 'file' && !isModelPathRelevant(attribute.collection)) { // hasMany
              // console.log(`WARNING 3.1: ${component.collectionName} has irrelevant attribute ${attributeName}`)
              return true
            }
            if ('model' in attribute && isCollectionRelevant(attribute.model)) { // hasOne
              // console.log(`WARNING 3.2: ${component.collectionName} has irrelevant attribute ${attributeName}`)
              return true
            }
            if (! 'type' in attribute) {
              console.log(`WARNING 2: ${component.collectionName} has attribute ${attributeName} without type`)
            }
            return false
          })
        if (irrelevantAttributes.length > 0) {
          console.log(`INFO 2: ${component.collectionName} has irrelevant attributes ${irrelevantAttributes} and is discarded`)
          return false
        }
        return true
      })
    return componentsGroupArray.concat(newComponentsGroupArray)
  }, [])

console.log(`INFO 3: ${S_3_COLLECTIONS.length} collections and ${S_3_COMPONENTS.length} components to be converted`)
const S_3_SCHEMA = {
  collections: S_3_COLLECTIONS,
  components: S_3_COMPONENTS,
}

const S_4_SCHEMA = {
  collections: [],
  components: [],
}



const addCollectionToS4Schema = (s3Collection) => {
  // hard copy s3Collection to s4Collection to avoid side effects
  const s4Collection = {
    kind: s3Collection.kind,
    modelName: s3Collection.modelName,
    collectionName: s3Collection.collectionName,
    displayName: s3Collection.displayName,
    s3DisplayName: s3Collection.s3DisplayName,
    s4: {
      kind: s3Collection.kind,
      collectionName: s3Collection.collectionName,
      info: {
        singularName: s3Collection.modelName,
        pluralName: pluralize(s3Collection.modelName),
        displayName: s3Collection.s3DisplayName,
      },
      options: {
        draftAndPublish: false
      },
      pluginOptions: {},
      attributes: convertAttributes(s3Collection.attributes, s3Collection.modelName)
    }
  }
  S_4_SCHEMA.collections.push(s4Collection)
  // console.log(`writeS4Collection: ${JSON.stringify(s3Collection, null, 2)}`)
}

const addComponentsToS4Schema = (componentNames) => {
  const addedComponentNames = []
  componentNames.forEach((componentName) => {
    // break componentName into componentCategory and modelName
    const [componentCategory, modelFileName] = componentName.split('.')
    // console.log(`addComponentToS4Schema: ${componentName}=${componentCategory}+${modelFileName}`)
    // if component already in s4Schema, skip
    if (S_4_SCHEMA.components
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
    const s3Component = S_3_SCHEMA.components
      .find((component) => {
        return component.modelName === modelFileName
          && component.componentCategory === componentCategory
      })
    if (!s3Component) {
      console.log(`WARNING 5: component ${componentName} not found in s3Schema`)
      return
    }
    // add component to s4Schema
    addComponentToS4Schema(s3Component)
    addedComponentNames.push(componentName)
  })
  return addedComponentNames
}

const isCollectionInV4Schema = (modelName) => {
  return S_4_SCHEMA.collections
    .find((collection) => {
      return collection.modelName === modelName
    })
}

const convertAttributes = (s3Attributes, name) => {
  const s4Attributes = {}
  Object.keys(s3Attributes).forEach((attributeName) => {
    const s3Attribute = s3Attributes[attributeName]
    if (!s3Attribute.type) {
      if (s3Attribute.model) {
        s3Attribute.type = 'relation'
        s3Attribute.relation = 'oneToOne'
        s3Attribute.target = `api::${s3Attribute.model}.${s3Attribute.model}`
        delete s3Attribute.model
      }
      // if s3attribute has collection property:
      // if s3attribute has via property, it is a manyToMany relation
      // if s3attribute has no via property, it is a oneToMany relation
      else if (s3Attribute.collection) { // 
        // console.log(`I: ${name} has attribute ${attributeName} with oneToMany collection ${s3Attribute.collection}`)
        if (!isCollectionInV4Schema(s3Attribute.collection)) {
          console.log(`WARNING 4.1: ${name} has attribute ${attributeName} with target ${s3Attribute.collection} which is not in s4Schema`)
          // return
        }
        s3Attribute.type = 'relation'
        if (s3Attribute.via) {
          s3Attribute.relation = 'manyToMany'
          if (s3Attribute.dominant === true) {
            s3Attribute.inversedBy = s3Attribute.via
          } else {
            s3Attribute.mappedBy = s3Attribute.via
          }
        } else {
          s3Attribute.relation = 'oneToMany'
        }
        s3Attribute.target = `api::${s3Attribute.collection}.${s3Attribute.collection}`
        delete s3Attribute.collection
      }
    }
    const s4Attribute = {
      type: s3Attribute.type,
      required: s3Attribute.required,
    }

    if (s3Attribute.repeatable === true) {
      s4Attribute.repeatable = true
    }

    if (s3Attribute.target === 'api::file.file'
      || s3Attribute.plugin === 'upload') {
      s4Attribute.allowedTypes = s3Attribute.allowedTypes
      s4Attribute.type = 'media'
      s4Attribute.multiple = s3Attribute.relation === 'oneToOne' ? false : true
      delete s4Attribute.target
      delete s3Attribute.relation
    }
    else if (s3Attribute.type === 'relation') {
      // if target is not in s3Schema, skip the attribute
      const targetName = s3Attribute.target.split('.')[1]
      if (!isCollectionInV4Schema(targetName)) {
        console.log(`WARNING 4.2: ${name} has attribute ${attributeName} with target ${s3Attribute.target} which is not in s4Schema`)
        // Object.keys(s4Attribute).forEach((key) => delete s4Attribute[key])
        // return
      }
      const maxNameLength = 45
      if (name.length + attributeName.length > maxNameLength) {
        console.log(`WARNING 4.5: ${name} has attribute ${attributeName} with name length ${name.length + attributeName.length} > ${maxNameLength}`)
        return
      }

      s4Attribute.relation = s3Attribute.relation
      s4Attribute.target = s3Attribute.target
      if (s3Attribute.inversedBy) {
        s4Attribute.inversedBy = s3Attribute.inversedBy
      }
      if (s3Attribute.mappedBy) {
        s4Attribute.mappedBy = s3Attribute.mappedBy
      }
    }

    if (s3Attribute.type === 'component') {
      s4Attribute.component = s3Attribute.component
    }
    if (s3Attribute.type === 'dynamiczone') {
      s4Attribute.components = s3Attribute.components
    }
    if (s3Attribute.type === 'media') {
      s4Attribute.allowedTypes = s3Attribute.allowedTypes
    }
    if (s3Attribute.type === 'richtext') {
      s4Attribute.type = 'text'
    }
    if (s3Attribute.type === 'enumeration') {
      s4Attribute.enum = s3Attribute.enum
    }
    if (!s4Attribute.type) {
      // console.log(`WARNING: ${name} has no type for attribute ${attributeName}`)
      return
    }
    s4Attributes[attributeName] = s4Attribute
  })
  return s4Attributes
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
      attributes: convertAttributes(s3Component.attributes, s3Component.collectionName)
    }
  }
  S_4_SCHEMA.components.push(s4Component)
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
    if (!modelName) {
      console.log(`ERROR 1: ${s3DislpayName} has bad _path: ${element._path}`)
      continue
    }
    const collectionName = modelName.replace(/-/g, '_')
    // find a collection in strapi3Schema.collections, where modelName or collectionName matches
    const s3Collection = S_3_SCHEMA.collections.find((collection) => {
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
      console.log(`WARNING 6: nor ${modelName} nor ${collectionName} nor ${s3DislpayName} was not found in strapi3Schema.collections`)
    }
    // console.log(`model: ${s3DislpayName}, modelName: ${modelName}, collectionName: ${collectionName}, collection: ${JSON.stringify(collection, null, 2)}`) // collection or singleType
  } else {
    // console.log(`WARNING: ${s3DislpayName} is a component`)
  }
}

fs.writeFileSync(path.join(__dirname, 'strapi3Schema.json'), JSON.stringify(S_3_SCHEMA, null, 4))
fs.writeFileSync(path.join(__dirname, 'strapi4Schema.json'), JSON.stringify(S_4_SCHEMA, null, 4))

// create components
S_4_SCHEMA.components.forEach((component) => {
  const categoryName = component.componentCategory
  const categoryPath = path.join(STRAPI4_COMPONENT_PATH, categoryName)
  if (!fs.existsSync(categoryPath)) {
    fs.mkdirSync(path.join(STRAPI4_COMPONENT_PATH, categoryName), { recursive: true })
  }

  const modelFileName = component.fileName
  const modelFile = path.join(categoryPath, `${modelFileName}.json`)
  if (fs.existsSync(modelFile)) {
    // return
    fs.rmSync(modelFile)
  }
  // console.log(`create modelFile ${modelFile} for component ${component.displayName}`) 
  fs.writeFileSync(modelFile, JSON.stringify(component.s4, null, 2))
})

// create collections
S_4_SCHEMA.collections.forEach((collection) => {
  const singularName = collection.modelName
  const s4APIPath = path.join(STRAPI4_API_PATH, singularName)
  const s4APISchemaPath = path.join(s4APIPath, 'content-types', singularName, 'schema.json')
  const s4APIControllerPath = path.join(s4APIPath, 'controllers')
  const s4APIRouterPath = path.join(s4APIPath, 'routes')
  const s4APIServicePath = path.join(s4APIPath, 'services')

  if (fs.existsSync(s4APIPath)) {
    // return
    fs.rmSync(s4APIPath, { recursive: true })
  }

  // create api folder
  fs.mkdirSync(s4APIPath, { recursive: true })

  // create content-types folder
  fs.mkdirSync(path.join(s4APIPath, 'content-types', singularName), { recursive: true })
  // create schema.json file
  fs.writeFileSync(s4APISchemaPath, JSON.stringify(collection.s4, null, 2))

  // create controllers folder
  fs.mkdirSync(s4APIControllerPath, { recursive: true })
  // create controller.js file
  fs.writeFileSync(path.join(s4APIControllerPath, `${singularName}.js`), `'use strict'\n\nconst { createCoreController } = require('@strapi/strapi').factories\n\nmodule.exports = createCoreController('api::${singularName}.${singularName}')`)

  // create routes folder
  fs.mkdirSync(s4APIRouterPath, { recursive: true })
  // create routes.js file
  fs.writeFileSync(path.join(s4APIRouterPath, `${singularName}.js`), `'use strict'\n\nconst { createCoreRouter } = require('@strapi/strapi').factories\n\nmodule.exports = createCoreRouter('api::${singularName}.${singularName}')`)

  // create services folder
  fs.mkdirSync(s4APIServicePath, { recursive: true })
  // create services.js file
  fs.writeFileSync(path.join(s4APIServicePath, `${singularName}.js`), `'use strict'\n\nconst { createCoreService } = require('@strapi/strapi').factories\n\nmodule.exports = createCoreService('api::${singularName}.${singularName}')`)

})

