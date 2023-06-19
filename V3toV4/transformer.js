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
   * @returns {Array<string>}
   * */
  getRelevantCollectionTypes() {
    return this.relevantCollectionTypes
  }

  /**	
   * @param {string} collectionType
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
      required: s3Attribute.required,
    }
    // If s3 attribute has no type, it is a relation to another model or file.
    // Here 'model' seems to indicate a oneToOne relation, 'collection' a oneToMany relation. If 'via' is set, it is a manyToMany relation.
    // If s3 attribute relates to file, its 'collection' or 'model' property is set to 'file'
    if (!s3Attribute.type) {
      if (s3Attribute.model === 'file' || s3Attribute.collection === 'file') {
        s4Attribute.type = 'media'
        s4Attribute.multiple = s3Attribute.collection === 'file'
        s4Attribute.allowedTypes = s3Attribute.allowedTypes
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
      return s4Attribute
    }

    if (s3Attribute.type === 'component') {
      // console.log('component', s3Attribute)
      this.useComponentType = s3Attribute.component
      s4Attribute.component = s3Attribute.component
      s4Attribute.repeatable = s3Attribute.repeatable
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
  constructor() {
    this.attributeTransformer = new AttributeTransformer()
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
    Object.keys(s3Component.attributes).forEach(s3Attribute => {
      try {
        s4Component.attributes[s3Attribute.name] = this.attributeTransformer.transform(s3Attribute)
      } catch (error) {
        throw new Error(`Attribute "${s3Attribute.name}" of component "${s3Component.collectionName}" could not be transformed: ${error.message}`)
      }
    })
    return s4Component
  }
}



module.exports = new Transformer()