
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
    if (!this.strapi3token.jwt || !this.strapi3token.expires || this.strapi3token.expires < Date.now())
    {
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


  /** Transport a collection type from v3 to v4
   * and return the number of transported collection objects
   * @param {Object} collectionType
   * @returns {number}
   * */
  async transportCollectionType(collectionType) {
    const s3token = await this.getStrapi3token()
    const s4token = await this.getStrapi4token()
    
    const s3url = `${S_3_URL}${collectionType.s3ApiPath}`
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

    const s4url = `${S_4_URL}${collectionType.s4ApiPath}`
    const s4data = []
    for (const item of s3data) {
      // console.log(`Uploading ${item.id} to ${s4url}. item: ${JSON.stringify(item)}`)
      const itemData = await axios.post(s4url, { data: item }, {
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s4token}` 
        }
      }).then((response) => response.data
      ).catch((error) => {
        if (error.response.status === 500) { return }
        // console.log(`Error uploading ${item.id}: ${error.response.status} ${error.response.statusText}`)
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