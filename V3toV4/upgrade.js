'use strict'

/* # Migrate Strapi from version 3 to version 4

  1. transform collection and component schemas
  2. transport data from Strapi 3 to Strapi 4
  3. validate data in Strapi 4

*/
/* ## 1. Schema transformation
         - async function transformSchema()

  1.1. Read relevant models from user-curated datamodel.yaml file and 
       preserve read order - it is important for import order
        - create a list of relevant collection types

  1.2. Read actual models from Strapi 3 folder structure
  1.2.1. Read collection types from /api folder
          - Skip the ones that are not in datamodel.yaml
          - mark the found ones as "isFound" in relevant collection types list
          - Save to ./RelevantCollectionTypes.json
              s3DatamodelKey: BusinessProfile
              collectionName: business_profiles
              kind: collectionType
              folderName: business-profile
              s3InfoName: BusinessProfile
              s3CollectionName: business_profiles
  
  1.3. Transform collections
  1.3.1. Transform collection types without attributes
          - Add v3 and v4 api paths to the collection type
          - Save to ./V4schema.flat.collections.json
  1.3.2. Transform collection types attributes
          - Throw an error on the ones that refer to collections 
            that are not in transformed collection types
          - Collect the list of used component types

  1.4. Transform components from the list of used component types
        - Read component types from /components folder
        - Throw an error if an attribute refers to collection not present in 
          transformed collection types
        - If attribute refers to a component type that is not in the list of
          used component types, then append it to the list of used component types
        - Repeat until no new component types are added to the list of used component types
        - Save the list without attributes to ./V4schema.flat.components.json
      
  1.5. Create schema files in target Strapi 4 folder structure
  1.5.1 Create ./api folder and /collectionName subfolders for each collection type
         - Create content-types, controllers, routes, services folders and respective files
  1.5.2 Create ./components folder
         - create component-name.json files for each component type and save them to 
           ./components/component-group-name/ folder

  1.6. Create ./V4schema.yaml file. Now we are ready for data :)
*/
/* ## 2. Data transport
         - async function transportData()
         - REST GET from strapi3 and POST to strapi4
           Will transport data from Strapi 3 to Strapi 4 one collection at a time
  2.1. Read ./V4schema.yaml file
  2.2. For each collection type fetch all records from Strapi 3
  2.3. For each record transform it to Strapi 4 format
  2.4. For each record POST it to Strapi 4
  2.5. Repeat until all records are transported
*/
/* ## 3. Data validation
         - async function validateData()
  3.1. For each collection type fetch all records from Strapi 3
  3.2. For each record fetch it from Strapi 4
  3.3. Compare the two records
  3.4. If they are not equal, log the error and continue
*/

// Some hints:
// - by "relevant" we mean collections that are present in the curated datamodel.yaml file
// - collection name is the table name in the database, also part of the path in api calls
// - folder name is different from the table name
// - _path attribute in s3datamodel.yaml is the path in the api calls
//    collection name = _path.replace(/-/g, '_').split('/')[1]
// - example:
//   - folder name: "tag-category"
//   - collection name (table name): "tag_categories"
//   - keyname in s3datamodel: "TagCategory"
//   - _path in s3datamodel: "/tag-categories"

const fs = require('fs')
const path = require('path')
const axios = require('axios')
const yaml = require('js-yaml')

const STRAPI3_ROOT = path.join(__dirname, '..', '..', 'web2021')
const STRAPI3_COLLECTIONS_PATH = path.join(STRAPI3_ROOT, 'strapi', 'strapi-development', 'api')
const STRAPI3_COMPONENTS_PATH = path.join(STRAPI3_ROOT, 'strapi', 'strapi-development', 'components')
const STRAPI3_DATAMODEL_PATH = path.join(STRAPI3_ROOT, 'ssg', 'docs', 'datamodel.yaml')

const STRAPI4_ROOT = path.join(__dirname, '..', '..', 'web2023')
const STRAPI4_API_PATH = path.join(STRAPI4_ROOT, 'strapi4', 'src', 'api')
const STRAPI4_COMPONENTS_PATH = path.join(STRAPI4_ROOT, 'strapi4', 'src', 'components')

const V4_SCHEMA_FILE = 'V4schema.flat.collections.withAttributes.json'

const transporter = require('./transporter')
const transformer = require('./transformer')
const attributeTransformer = transformer.attributeTransformer
const collectionTransformer = transformer.collectionTransformer
const componentTransformer = transformer.componentTransformer

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
const matchCollectionType = (v4CollectionType, v3Model) => {
  return v4CollectionType.collectionName === v3Model.collectionName
    || v4CollectionType.s3DatamodelKey === v3Model.info.name
}


const transformSchema = async () => {
  const s3DatamodelPathToCollectionName = (s3DatamodelPath) =>
    s3DatamodelPath.replace(/-/g, '_').split('/')[1]

  // 1.1. Read relevant models from user-curated datamodel.yaml file and
  //      create a list of relevant collection types
  const datamodel = yaml.load(fs.readFileSync(STRAPI3_DATAMODEL_PATH, 'utf8'))
  const relevantCollectionTypes = Object.keys(datamodel)
    .map(key => {
      return {
        key: key,
        model: datamodel[key]
      }
    })
    .filter(item => item.model._path)
    .map(item => {
      const collectionName = s3DatamodelPathToCollectionName(item.model._path)
      return {
        s3DatamodelKey: item.key,
        collectionName: collectionName,
        isFound: false
      }
    })
    ;
  // for (const { s3DatamodelKey } of relevantCollectionTypes) console.log(s3DatamodelKey)


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
    .filter(item => relevantCollectionTypes.find(collType => matchCollectionType(collType, item)))

    ; // TODO: this semicolon is required. Why?

  // mark as found and populate with kind and s3* attributes
  V3CollectionTypes.forEach(item => {
    const relevantCollection = relevantCollectionTypes
      .find(collType => matchCollectionType(collType, item))
    delete relevantCollection.isFound
    relevantCollection.kind = item.kind
    relevantCollection.folderName = item.folderName
    relevantCollection.s3ApiPath = item.s3ApiPath
    relevantCollection.s3InfoName = item.info.name
    relevantCollection.s3CollectionName = item.collectionName
  })

  // log out the ones that are not of kind collectionType or singleType
  V3CollectionTypes.forEach(item => {
    if (item.kind !== 'collectionType' && item.kind !== 'singleType') {
      console.log(`WARNING 1.2: Collection type ${item.collectionName} is not of kind collectionType`)
    }
  })

  // log out the ones that are not found
  relevantCollectionTypes.forEach(item => {
    if (item.isFound === false) {
      console.log(`WARNING 1.1: Collection type ${item.collectionName} is not found in Strapi 3 folder structure`)
    }
  })

  // Save to ./RelevantCollectionTypes.json
  fs.writeFileSync(path.join(__dirname, 'RelevantCollectionTypes.json'), JSON.stringify(relevantCollectionTypes, null, 2))

  // 1.3. Transform collection types to Strapi 4 format
  // 1.3.1. Transform collection types without attributes and options
  // - Add v3 and v4 api paths to the collection type
  // - Save to ./V4schema.flat.collections.json
  relevantCollectionTypes.forEach(item => {
    // Transfer to transformers
    transformer.relevantCollectionType = item
    // item.s3ApiPath = `/${pluralize(item.folderName)}`
    item.s4ApiPath = `/api/${pluralize(item.folderName)}`
    item.v4 = {
      kind: item.kind,
      collectionName: item.collectionName,
      info: {
        singularName: item.folderName,
        pluralName: pluralize(item.folderName),
        displayName: item.s3InfoName
      }
    }
  })
  fs.writeFileSync(path.join(__dirname, 'V4schema.flat.collections.json'), JSON.stringify(relevantCollectionTypes, null, 2))


  // 1.3.2. Transform collection types attributes
  // - Throw an error on the ones that refer to collections 
  //   that are not in transformed collection types
  // - Collect the list of used component types
  relevantCollectionTypes.forEach(collType => {
    const V3Collection = V3CollectionTypes
      .find(model => matchCollectionType(collType, model))
    if (!V3Collection) {
      throw new Error(`Collection ${collType.collectionName} not found in V3CollectionTypes`)
    }

    const attrNames = Object.keys(V3Collection.attributes)
    collType.v4.attributes = {}
    attrNames.forEach(attrName => {
      const v3Attr = V3Collection.attributes[attrName]
      // console.log(`Transforming attribute "${attrName}": ${JSON.stringify(v3Attr)}`)
      try {
        collType.v4.attributes[attrName] = attributeTransformer.transform(v3Attr)
      } catch (error) {
        throw new Error(`Attribute "${attrName}" of collection "${collType.collectionName}" is not resolved: ${error.message}`)
      }
    })
  })

  fs.writeFileSync(path.join(__dirname, V4_SCHEMA_FILE), JSON.stringify(relevantCollectionTypes, null, 2))

  // console.log('Used component types:', transformer.getUsedComponentTypes())
  // console.log('Relevant collection types:', transformer.getRelevantCollectionTypes())

  // 1.4. Transform component types to Strapi 4 format
  // Also, verify, that only relevant collection types are used in component attributes.
  // - Add v3 and v4 api paths to the component type
  const v4Components = []
  let unparsedComponentPath = transformer.getUnparsedComponentType() // i.e. 'film.role-person'
  while (unparsedComponentPath) {
    const [folderName, componentName] = unparsedComponentPath.split('.')
    const settings = JSON.parse(fs.readFileSync(path.join(STRAPI3_COMPONENTS_PATH, folderName, `${componentName}.json`), 'utf8'))
    try {
      const v4 = componentTransformer.transform(settings)
      transformer.markComponentTypeAsParsed(unparsedComponentPath)
      v4Components.push({
        folderName: folderName,
        componentName: componentName,
        s3InfoName: settings.info.name,
        s3ApiPath: `/components/${folderName}/${componentName}`,
        s4ApiPath: `/components/${folderName}/${componentName}`,
        v4: v4
      })
    } catch (error) {
      throw new Error(`Component "${unparsedComponentPath}" is not resolved: ${error.message}`)
    }
    unparsedComponentPath = transformer.getUnparsedComponentType()
  }
  fs.writeFileSync(path.join(__dirname, 'V4schema.flat.components.json'), JSON.stringify(v4Components, null, 2))

  // 1.5. Create schema files in target Strapi 4 folder structure
  // 1.5.1 Create ./api folder and /collectionName subfolders for each collection type
  fs.mkdirSync(STRAPI4_API_PATH, { recursive: true })
  relevantCollectionTypes.forEach(collType => {
    const schemaFolder = path.join(STRAPI4_API_PATH, collType.folderName, 'content-types', collType.folderName)
    fs.mkdirSync(schemaFolder, { recursive: true })
    fs.writeFileSync(path.join(schemaFolder, 'schema.json'), JSON.stringify(collType.v4, null, 2))
    fs.mkdirSync(path.join(STRAPI4_API_PATH, collType.folderName, 'controllers'), { recursive: true })
    fs.mkdirSync(path.join(STRAPI4_API_PATH, collType.folderName, 'routes'), { recursive: true })
    fs.mkdirSync(path.join(STRAPI4_API_PATH, collType.folderName, 'services'), { recursive: true })
    fs.writeFileSync(path.join(STRAPI4_API_PATH, collType.folderName, 'controllers', `${collType.folderName}.js`),
      `'use strict'\n\nconst { createCoreController } = require('@strapi/strapi').factories\n\nmodule.exports = createCoreController('api::${collType.folderName}.${collType.folderName}')`)
    fs.writeFileSync(path.join(STRAPI4_API_PATH, collType.folderName, 'routes', `${collType.folderName}.js`),
      `'use strict'\n\nconst { createCoreRouter } = require('@strapi/strapi').factories\n\nmodule.exports = createCoreRouter('api::${collType.folderName}.${collType.folderName}')`)
    fs.writeFileSync(path.join(STRAPI4_API_PATH, collType.folderName, 'services', `${collType.folderName}.js`),
      `'use strict'\n\nconst { createCoreService } = require('@strapi/strapi').factories\n\nmodule.exports = createCoreService('api::${collType.folderName}.${collType.folderName}')`)
  })
  //        - Create controllers, routes, services folders and respective files

  // 1.5.2 Create ./components folder
  //        - create component-name.json files for each component type and save them to 
  //          ./components/component-group-name/ folder
  fs.mkdirSync(STRAPI4_COMPONENTS_PATH, { recursive: true })
  v4Components.forEach(compType => {
    const compGroupFolder = path.join(STRAPI4_COMPONENTS_PATH, compType.folderName)
    fs.mkdirSync(compGroupFolder, { recursive: true })
    fs.writeFileSync(path.join(compGroupFolder, `${compType.componentName}.json`), JSON.stringify(compType.v4, null, 2))
  })

}

const transportData = async () => {

  const readRequiredAttributes = (collectionType) => {
    const required = []
    Object.keys(collectionType.v4.attributes).forEach(attrName => {
      const attr = collectionType.v4.attributes[attrName]
      if (attr.required) {
        required.push(attrName)
      }
    })
    return required
  }

  const collectionTypes = require('./V4schema.flat.collections.withAttributes.json')
  const firstFiveCollectionTypes = collectionTypes//.slice(15, -1)

  for (const collectionType of firstFiveCollectionTypes) {
    console.log(`Reading entries for collection type "${collectionType.collectionName}"...`)
    const nonRelationAttributes = Object.keys(collectionType.v4.attributes)
      .filter(key => collectionType.v4.attributes[key].type !== 'relation')
    const relationAttributes = Object.keys(collectionType.v4.attributes)
      .filter(key => collectionType.v4.attributes[key].type === 'relation')
    const s3RequiredDataFileName = path.join(__dirname, 's3data', `s3.${collectionType.collectionName}.required.json`)
    const s3DataFileName = path.join(__dirname, 's3data', `s3.${collectionType.collectionName}.json`)
    const s3DataFromFile = fs.existsSync(s3DataFileName) ? JSON.parse(fs.readFileSync(s3DataFileName, 'utf8')) : false

    const s3read = s3DataFromFile || await transporter.readS3(collectionType)
    // reduce relation attributes to contain just IDs
    s3read.s3data
      .forEach(entry => {
        // console.log(`entry: ${JSON.stringify(entry, null, 2)}`)
        for (const attr of relationAttributes) {
          // console.log(`attr: ${attr}`)
          if (entry[attr] && entry[attr].id) {
            entry[attr] = entry[attr].id
          }
        }
        return entry
      })

    fs.writeFileSync(s3DataFileName, JSON.stringify(s3read, null, 2))

    const requiredAttributes = readRequiredAttributes(collectionType)
    const s3RequiredOnly = {
      s3ApiPath: s3read.s3ApiPath,
      s4ApiPath: s3read.s4ApiPath,
      s3data: s3read.s3data.map(entry => {
        const newEntry = { id: entry.id }
        for (const attrName of Object.keys(entry)) {
          if (requiredAttributes.includes(attrName)) {
            newEntry[attrName] = entry[attrName]
          }

        }
        return newEntry
      })
    }

    fs.writeFileSync(s3RequiredDataFileName, JSON.stringify(s3RequiredOnly, null, 2))

    console.log(`Saved entries for collection type "${collectionType.collectionName}"...`)
  }
  // delete s4 entries. Loop over s3DataFromFile.s3data
  // await deleteFromS4(firstFiveCollectionTypes)

  // import entries. Loop over s3DataFromFile.s3data
  // await seedS4Entries(firstFiveCollectionTypes)

  async function seedS4Entries(collectionTypes) {
    for (const collectionType of collectionTypes) {
      console.log(`Creating entries for collection type "${collectionType.collectionName}"...`)
      const relationAttributes = Object.keys(collectionType.v4.attributes)
        .filter(key => collectionType.v4.attributes[key].type === 'relation')

      const s3DataFileName = path.join(__dirname, 's3data', `s3.${collectionType.collectionName}.required.json`)
      const s3DataFromFile = JSON.parse(fs.readFileSync(s3DataFileName, 'utf8'))

      // import entries. Loop over s3DataFromFile.s3data
      for (const entry of s3DataFromFile.s3data) {
        await transporter.createEntry(s3DataFromFile.s4ApiPath, entry)
      }
    }
  }

  async function deleteFromS4(collectionTypes) {
    for (const collectionType of collectionTypes) {
      console.log(`Deleting entries for collection type "${collectionType.collectionName}"...`)
      const s3DataFileName = path.join(__dirname, 's3data', `s3.${collectionType.collectionName}.json`)
      const s3DataFromFile = fs.existsSync(s3DataFileName) ? JSON.parse(fs.readFileSync(s3DataFileName, 'utf8')) : false
      for (const entry of s3DataFromFile.s3data) {
        await transporter.deleteEntry(s3DataFromFile.s4ApiPath, entry.id)
      }
    }
  }
}

const validateData = async () => {
  return true
}

const main = async () => {
  // - Strapi 3 schema gets converted to Strapi 4 schema;
  // - Strapi 4 schema files get created;
  // - V4 schema is saved to V4_SCHEMA_FILE file;
  // await transformSchema()
  // Now Strapi4 should be able to start with the new schema,
  // automatically creating the database tables.

  await transportData()
  // await validateData()
}

main(); return

// experiments and tests

// distill V4Schema.
// leave only bidirectional attributes
// leave only collection types with bidirectional attributes ( attributes that have "mappedBy" or "inversedBy" properties )
const bidirectionalCollectionTypes = require('./V4schema.flat.collections.withAttributes.json')
  .filter(collType => Object.values(collType.v4.attributes).some(attr => attr.mappedBy || attr.inversedBy))
  // leave only bidirectional attributes
  .map(collType => {
    const distilledCollection = {
      collectionDisplayName: collType.s3InfoName,
      attributes: {}
    }
    Object.keys(collType.v4.attributes).forEach(attrName => {
      const attr = collType.v4.attributes[attrName]
      if (attr.mappedBy || attr.inversedBy) {
        distilledCollection.attributes[attrName] = attr
        delete attr.relation
        delete attr.type
      }
    })
    return distilledCollection
  })
fs.writeFileSync(path.join(__dirname, 'V4schema.with.bidirectional.Attributes.json'), JSON.stringify(bidirectionalCollectionTypes, null, 2))

