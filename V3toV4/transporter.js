
const S_3_URL = 'https://admin.poff.ee'
const S_3_IDENTIFIER = process.env.StrapiUserName
const S_3_PASSWORD = process.env.StrapiPassword

const S_4_URL = `http://127.0.0.1:1337`

// import jwt from 'jsonwebtoken'
const jwt = require('jsonwebtoken')
const axios = require('axios')
const qs = require('qs')

const Transporter = class {
  constructor() {
    this.strapi3token = {
      jwt: '',
      expires: null
    }
    this.strapi4token = {
      jwt: '',
      expires: null
    }
  }

  async getStrapi4token() {
    // console.log(`getStrapi4token: ${process.env.LocalStrapi4Token}`)
    return process.env.LocalStrapi4Token
  }

  async getStrapi3token() {
    if (!this.strapi3token.jwt || !this.strapi3token.expires || this.strapi3token.expires < Date.now()) {
      const freshToken = await this.refreshToken(`${S_3_URL}/auth/local`, S_3_IDENTIFIER, S_3_PASSWORD)
      this.strapi3token.jwt = freshToken.jwt
      this.strapi3token.expires = freshToken.expires
    }
    return this.strapi3token.jwt
  }

  async refreshToken(url, identifier, password) {
    return await axios.post(url, qs.stringify({
      identifier: identifier,
      password: password
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).then((response) => {
      const decoded = jwt.decode(response.data.jwt)
      console.log(`refreshed token for ${identifier} expires at ${new Date(decoded.exp * 1000)}`)
      return {
        jwt: response.data.jwt,
        expires: decoded.exp * 1000
      }
    }).catch((error) => {
      console.log(error)
    })
  }

  /** Read data from S3
   * @param {Object} collectionType
   * @returns {Object} 
   * */
  async readS3(collectionType) {
    const s3token = await this.getStrapi3token()
    const limit = -1
    const s3url = `${S_3_URL}${collectionType.s3ApiPath}?_limit=${limit}`
    // console.log(`s3url: ${s3url}, collectionType: ${JSON.stringify(collectionType)}`)
    const s3data = await axios.get(s3url, {
      headers: { Authorization: `Bearer ${s3token}` }
    }).then((response) => response.data
    ).catch((error) => {
      console.log(`error.response.status: ${error.response.status} ${error.response.statusText}`)
    })

    if (!s3data || !s3data.length || s3data.length === 0) {
      return {
        s3ApiPath: collectionType.s3ApiPath,
        s4ApiPath: collectionType.s4ApiPath,
        s3data: []
      }
    }
    return {
      s3ApiPath: collectionType.s3ApiPath,
      s4ApiPath: collectionType.s4ApiPath,
      s3data: s3data
    }
  }


  /** Delete entry from S4
   * @param {string} s4ApiPath
   * @param {number} id
   */
  async deleteEntry(s4ApiPath, id) {
    // return
    const s4token = await this.getStrapi4token()
    const s4url = `${S_4_URL}${s4ApiPath}/${id}`
    const s4data = await axios.delete(s4url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s4token}`
      }
    }).then((response) => response.data
    ).catch((error) => {
      // console.log(`Error deleting ${id}: ${error.response.status} ${error.response.statusText}`)
    })
  }

  /** Fill existing entry in S4
   * @param {string} s4ApiPath
   * @param {Object} entry
   */
  async fillEntry(s4ApiPath, entry) {
    const s4token = await this.getStrapi4token()
    const s4url = `${S_4_URL}${s4ApiPath}/${entry.id}`
    // console.log( `fillEntry: ${s4url}, entry: ${JSON.stringify(entry)}`)
    const s4data = await axios.put(s4url, { data: entry }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s4token}`
      }
    }).then((response) => response.data
    ).catch((error) => {
      console.log(`Error uploading ${entry.id}: ${error.response.status} ${error.response.statusText}`)
      throw error
    })
  }

  /** Create entry in S4
   * @param {string} s4ApiPath
   * @param {Object} entry
   */
  async createEntry(s4ApiPath, entry) {
    const s4token = await this.getStrapi4token()
    const s4url = `${S_4_URL}${s4ApiPath}`
    // console.log( `createEntry: ${s4ApiPath}, entry: ${JSON.stringify(entry)}`)
    const s4data = await axios.post(s4url, { data: entry }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s4token}`
      }
    }).then((response) => response.data
    ).catch((error) => {
      console.log(`Error uploading ${entry.id}: ${error.response.status} ${error.response.statusText}`)
      throw error
    })
  }

  /** Initialize all collections of a given type  
   * @param {Object} collectionType
   * @returns {Object} of not created and semi created (without relation props) items
   * */
  async initCollections(collectionType) {

    const scrapRelationAttributes = (entity) => {
      // console.log(`scrapRelationAttributes: ${JSON.stringify(entity)}`)
      return Object.keys(entity).reduce((acc, key) => {
        console.log(`key: ${key} type: ${entity[key]}`)
        if (entity[key].type !== 'relation') {
          acc[key] = entity[key]
        }
        return acc
      }, {})
    }
    const scapAllButRelationAttributes = (entity) => {
      entity.attributes = Object.keys(entity.attributes).reduce((acc, key) => {
        if (entity.attributes[key].type === 'relation') {
          acc[key] = entity.attributes[key]
        }
        return acc
      }, { id: entity.attributes.id })
    }

    const s3token = await this.getStrapi3token()
    const s4token = await this.getStrapi4token()
    const limit = 2
    const s3url = `${S_3_URL}${collectionType.s3ApiPath}?_limit=${limit}`
    const s3data = await axios.get(s3url, {
      headers: { Authorization: `Bearer ${s3token}` }
    }).then((response) => response.data
    ).catch((error) => {
      console.log(`error.response.status: ${error.response.status} ${error.response.statusText}`)
    })

    if (!s3data || !s3data.length || s3data.length === 0) {
      return 0
    }
    console.log(`Initializing ${s3data.length} objects of ${collectionType.collectionName}...`)

    const s4url = `${S_4_URL}/api/${collectionType.v4.info.pluralName}`
    const s4data = []
    const notCreated = []
    const semiCreated = []
    for (const item of s3data) {
      notCreated.push(item)
      // console.log(`Uploading ${item.id} to ${s4url}. item: ${JSON.stringify(item)}`)
      const itemData = await axios.post(s4url, { data: scrapRelationAttributes(item) }, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s4token}`
        }
      }).then((response) => response.data
      ).catch((error) => {
        if (error.response.status === 500) { return }
        console.log(`Error uploading ${item.id}: ${error.response.status} ${error.response.statusText}`)
      })
      if (!itemData) {
        // console.log(`Error uploading ${item.id} - no item data returned`)
        continue
      }
      // console.log(`Uploaded ${itemData.data.id} to ${s4url}`)
      s4data.push(itemData)
      notCreated.pop()
    }
    return { notCreated, semiCreated }
  }

  /** Transport a collection type from v3 to v4
   * and return the number of transported collection objects
   * @param {Object} collectionType
   * @returns {number}
   * */
  async transportCollectionType(collectionType, idsOnly = false) {
    const s3token = await this.getStrapi3token()
    const s4token = await this.getStrapi4token()

    const s3url = `${S_3_URL}${collectionType.s3ApiPath}?_limit=-1`
    const s3data = await axios.get(s3url, {
      headers: { Authorization: `Bearer ${s3token}` }
    }).then((response) => response.data
    ).catch((error) => {
      console.log(`error.response.status: ${error.response.status} ${error.response.statusText}`)
    })

    if (!s3data || !s3data.length || s3data.length === 0) {
      return 0
    }
    console.log(`Transporting ${s3data.length} objects of ${collectionType.collectionName}...`)

    const s4url = `${S_4_URL}/api/${collectionType.v4.info.pluralName}`
    const s4data = []
    for (const item of s3data) {
      // console.log(`Uploading ${item.id} to ${s4url}. item: ${JSON.stringify(item)}`)
      const itemData = await axios.post(s4url, { data: (idsOnly ? { id: item.id } : item) }, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s4token}`
        }
      }).then((response) => response.data
      ).catch((error) => {
        if (error.response.status === 500) { return }
        console.log(`Error uploading ${item.id}: ${error.response.status} ${error.response.statusText}`)
      })
      if (!itemData) {
        // console.log(`Error uploading ${item.id} - no item data returned`)
        continue
      }
      // console.log(`Uploaded ${itemData.data.id} to ${s4url}`)
      s4data.push(itemData)
    }
    return s4data.length
  }
}

module.exports = new Transporter()