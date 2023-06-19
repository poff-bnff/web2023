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
const STRAPI4_COMPONENT_PATH = path.join(STRAPI4_ROOT, 'strapi4', 'src', 'components')

const transformer = require('./transformer')
const attributeTransformer = transformer.attributeTransformer
const collectionTransformer = transformer.collectionTransformer
const componentTransformer = transformer.componentTransformer

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
    // map file name to actual description from settings.json
    .map(item => {
      const settings = JSON.parse(fs.readFileSync(path.join(STRAPI3_COLLECTIONS_PATH, item, 'models', `${item}.settings.json`), 'utf8'))
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
    transformer.relevantCollectionType = item.collectionName
    item.s3ApiPath = `/${item.folderName}`
    item.s4ApiPath = `/api/${item.folderName}`
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
  
  fs.writeFileSync(path.join(__dirname, 'V4schema.flat.collections.withAttributes.json'), JSON.stringify(relevantCollectionTypes, null, 2))
  
  // console.log('Used component types:', transformer.getUsedComponentTypes())
  // console.log('Relevant collection types:', transformer.getRelevantCollectionTypes())
  
  // 1.4. Transform component types to Strapi 4 format
  // Also, verify, that only relevant collection types are used in component attributes.
  // - Add v3 and v4 api paths to the component type
  const relevantComponentTypes = transformer.getUsedComponentTypes()
    .map(componentFullName => {
      const [folderName, componentName] = componentFullName.split('.')
      const settings = JSON.parse(fs.readFileSync(path.join(STRAPI3_COMPONENTS_PATH, folderName, `${componentName}.json`), 'utf8'))
      const v4 = componentTransformer.transform(settings)
      return {
        folderName: folderName,
        componentName: componentName,
        s3InfoName: settings.info.name,
        s3ApiPath: `/components/${folderName}${componentName}`,
        s4ApiPath: `/components/${folderName}${componentName}`,
        v4: v4
      }
    })
  fs.writeFileSync(path.join(__dirname, 'V4schema.flat.components.json'), JSON.stringify(relevantComponentTypes, null, 2))  

}

const transportData = async () => {
  return true
}

const validateData = async () => {
  return true
}

const main = async () => {
  await transformSchema()
  await transportData()
  await validateData()
}

main()

