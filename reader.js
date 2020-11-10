/**
 * @author Tom De Caluwé
 * @copyright 2016 Tom De Caluwé
 * @license Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

var Parser = require('./parser.js');
var Validator = require('./validator.js');

/**
 * The `Reader` class is included for backwards compatibility. It translates an
 * UN/EDIFACT document to an array of segments. Each segment has a `name` and
 * `elements` property where `elements` is an array consisting of component
 * arrays. The class exposes a `parse()` method which accepts the document as a
 * string.
 */
var Reader = function () {
  var result = [], elements, components;
  this._validator = new Validator();
  this._parser = new Parser(this._validator);
  this._validator.define(require('./segments.js'));
  this._validator.define(require('./elements.js'));
  this._result = result;
  this._parser.onopensegment = function (segment) {
    elements = [];
    result.push({ name: segment, elements: elements });
  }
  this._parser.onelement = function () {
    components = [];
    elements.push(components);
  }
  this._parser.oncomponent = function (value) {
    components.push(value);
  }
}

/**
 * Provide the underlying `Validator` with segment or element definitions.
 *
 * @summary Define segment and element structures.
 * @param {Object} definitions An object containing the definitions.
 */
Reader.prototype.define = function (definitions) {
  this._validator.define(definitions);
}

/**
 * @summary Parse a UN/EDIFACT document
 * @param {String} document The input document.
 * @returns {Array} An array of segment objects.
 */
Reader.prototype.parse = function (document) {
  this._parser.write(document);
  this._parser.close();
  return this._result;
}

module.exports = Reader;
