const Transformer = class {
  constructor() {
    this.componentTransformer = new ComponentTransformer(this)
    this.attributeTransformer = new AttributeTransformer(this)
    this.relevantCollectionTypes = []
    this.usedComponentTypes = []
  }

  /**
   * @returns {Array<string>}
   * */
  getUsedComponentTypes() {
    return this.usedComponentTypes
  }

  /**
   * @param {string} componentType
   */
  set useComponentType(componentType) {
    if (!this.usedComponentTypes.includes(componentType)) {
      this.usedComponentTypes.push(componentType)
    }
  }

  /**
   * @returns {Array<Object>}
   * */
  getRelevantCollectionTypes() {
    return this.relevantCollectionTypes
  }

  /**
   * @returns {Array<string>}
   * */
  getRelevantCollectionNames() {
    return this.relevantCollectionTypes.map(collectionType => collectionType.collectionName)
  }
  /**
   * @returns {Array<string>}
   * */
  getRelCollFolderNames() {
    return this.relevantCollectionTypes.map(collectionType => collectionType.folderName).sort()
  }

  /**	
   * @param {Object} collectionType
   * */
  set relevantCollectionType(collectionType) {
    if (!this.relevantCollectionTypes.includes(collectionType)) {
      this.relevantCollectionTypes.push(collectionType)
    }
  }
}

// AttributeTransformer class
// - has a method transform that takes a v3 attribute and returns a v4 attribute
// - saves all used component types in a list
// - has a method getUsedComponentTypes that returns a list of component types used in the collection type

const AttributeTransformer = class {
  constructor(transformer) {
    this.transformer = transformer
    this.attributeMapping = {
      'string': 'string',
      'text': 'text',
      'richtext': 'richtext',
      'datetime': 'datetime',
      'date': 'date',
      'time': 'time',
      'integer': 'integer',
      'biginteger': 'biginteger',
      'float': 'float',
      'decimal': 'decimal',
      'boolean': 'boolean',
      'email': 'email',
      'password': 'password',
      'uid': 'uid',
    }
  }

  transform(s3Attribute) {
    const s4Attribute = {
      type: s3Attribute.type,
      required: s3Attribute.required || undefined,
    }
    // If s3 attribute has no type, it is a relation to another model or file.
    // Here 'model' seems to indicate a oneToOne relation, 'collection' a oneToMany relation. If 'via' is set, it is a manyToMany relation.
    // If s3 attribute relates to file, its 'collection' or 'model' property is set to 'file'
    if (!s3Attribute.type) {
      if (s3Attribute.model === 'file' || s3Attribute.collection === 'file') {
        s4Attribute.type = 'media'
        s4Attribute.multiple = s3Attribute.collection === 'file' || undefined
        s4Attribute.allowedTypes = s3Attribute.allowedTypes
        // return early as there is no need to further handle media relations
        return s4Attribute
      }
      else if (s3Attribute.plugin) {
        s4Attribute.type = 'relation'
        if (s3Attribute.model) {
          s4Attribute.relation = 'oneToOne'
          s4Attribute.target = `plugin::${s3Attribute.plugin}.${s3Attribute.model}`
        } else if (s3Attribute.collection) {
          s4Attribute.relation = 'oneToMany'
          if (s3Attribute.via) {
            s4Attribute.relation = 'manyToMany'
            if (s3Attribute.dominant === true) {
              s4Attribute.inversedBy = s3Attribute.via
            } else {
              s4Attribute.mappedBy = s3Attribute.via
            }
          }
          s4Attribute.target = `plugin::${s3Attribute.plugin}.${s3Attribute.collection}`
        }
        // return early as I dont know, how to further handle plugin relations
        return s4Attribute
      }
      else if (s3Attribute.model) {
        s4Attribute.type = 'relation'
        s4Attribute.relation = 'oneToOne'
        s4Attribute.target = `api::${s3Attribute.model}.${s3Attribute.model}`
      }
      else if (s3Attribute.collection) {
        s4Attribute.type = 'relation'
        s4Attribute.relation = 'oneToMany'
        s4Attribute.target = `api::${s3Attribute.collection}.${s3Attribute.collection}`
        if (s3Attribute.via) {
          s4Attribute.relation = 'manyToMany'
          if (s3Attribute.dominant === true) {
            s4Attribute.inversedBy = s3Attribute.via
          } else {
            s4Attribute.mappedBy = s3Attribute.via
          }
        }
      }
      // If related model is not in relevant collection types, throw an error
      if (!this.transformer.getRelCollFolderNames().includes(s4Attribute.target.split('.')[1])) {
        throw new Error(`Related model "${s4Attribute.target}" is not in relevant collection types ${this.transformer.getRelCollFolderNames()}`)
      }
      return s4Attribute
    }

    if (s3Attribute.type === 'component') {
      // console.log('component', s3Attribute)
      this.useComponentType = s3Attribute.component
      s4Attribute.repeatable = s3Attribute.repeatable || undefined
      s4Attribute.component = s3Attribute.component
      return s4Attribute
    }
    if (s3Attribute.type === 'enumeration') {
      s4Attribute.enum = s3Attribute.enum
      return s4Attribute
    }

    if (s3Attribute.type in this.attributeMapping) {
      s4Attribute.type = this.attributeMapping[s3Attribute.type]
      return s4Attribute
    }

    throw new Error(`Attribute of type "${s3Attribute.type}" is not resolved`)
  }

  getUsedComponentTypes() {
    return this.transformer.getUsedComponentTypes()
  }

  set useComponentType(componentType) {
    this.transformer.useComponentType = componentType
  }

  getRelevantCollectionTypes() {
    return this.transformer.getRelevantCollectionTypes()
  }

  set relevantCollectionType(collectionType) {
    this.transformer.relevantCollectionType = collectionType
  }
}


const ComponentTransformer = class {
  constructor(transformer) {
    this.transformer = transformer
  }

  transform(s3Component) {
    const s4Component = {
      collectionName: s3Component.collectionName,
      info: {
        displayName: s3Component.info.name,
      },
      options: s3Component.options,
      attributes: {},
    }
    Object.keys(s3Component.attributes).forEach(s3AttributeName => {
      try {
        s4Component.attributes[s3AttributeName] = this.transformer.attributeTransformer.transform(s3Component.attributes[s3AttributeName])
      } catch (error) {
        throw new Error(`Attribute "${s3AttributeName.name}" of component "${s3Component.collectionName}" could not be transformed: ${error.message}`)
      }
    })
    return s4Component
  }
}



module.exports = new Transformer()