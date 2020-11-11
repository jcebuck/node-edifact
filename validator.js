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

/**
 * The `Validator` can be used as an add-on to `Parser` class, to enable
 * validation of segments, elements and components. This class implements a
 * tolerant validator, only segments and elemens for which definitions are
 * provided will be validated. Other segments or elements will pass through
 * untouched. Validation includes:
 * * Checking data element counts, including mandatory elements.
 * * Checking component counts, including mandatory components.
 * * Checking components against they're required format.
 */
var Validator = function () {
  this._segments = {};
  this._elements = {};
  this._formats = {};
  this._counts = {
    segment: 0,
    element: 0,
    component: 0
  };
  this._state = Validator.states.all;
}

/**
 * @summary Disable validation.
 */
Validator.prototype.disable = function () {
  this._state = Validator.states.none;
}

/**
 * @summary Enable validation on the next segment.
 */
Validator.prototype.enable = function () {
  this._state = Validator.states.segments;
}

/**
 * To define a segment or element the definitions object should contain the
 * name as a key, and an object describing it's structure as a value. This
 * object contains the `requires` key to define the number of mandatory
 * elements or components. The key `elements` should be included containing a
 * list of element names to describe a segment. Similarly, an element
 * definition contains a `components` array describing the format of the
 * components.
 *
 * To simplify things, a non-composite element is regarded as an element
 * having only one component.
 *
 * @summary Define segment and element structures.
 * @param {Object} definitions An object containing the definitions.
 */
Validator.prototype.define = function (definitions) {
  for (var key in definitions) {
    if (definitions[key].elements) {
      this._segments[key] = definitions[key];
    }
    if (definitions[key].components) {
      this._elements[key] = definitions[key];
    }
  }
}

/**
 * @summary Request a component definition associated with a format string.
 * @returns {Object} A component definition.
 */
Validator.prototype.format = function (formatString) {
  // Check if we have a component definition in cache for this format string.
  if (this._formats[formatString]) {
    return this._formats[formatString];
  } else {
    var parts;
    if ((parts = /^(a|an|n)(\.\.)?([1-9][0-9]*)?$/.exec(formatString))) {
      var max = parseInt(parts[3]);
      var min = parts[2] === '..' ? 0 : max;
      var alpha, numeric;
      switch (parts[1]) {
      case 'a':
        alpha = true;
        break;
      case 'n':
        numeric = true;
        break;
      case 'an':
        alpha = true;
        numeric = true;
        break;
      }
      return this._formats[formatString] = { alpha: alpha, numeric: numeric, minimum: min, maximum: max };
    } else {
      throw Validator.errors.invalidFormatString(formatString);
    }
  }
}

/**
 * @summary Open a new segment.
 * @param {String} segment The segment name.
 */
Validator.prototype.onopensegment = function (segment) {
  switch (this._state) {
  case Validator.states.all:
  case Validator.states.elements:
  case Validator.states.segments:
  case Validator.states.enable:
    // Try to retrieve a segment definition if validation is not turned off.
    if ((this._segment = this._segments[segment])) {
      // The onelement function will close the previous element, however we
      // don't want the component counts to be checked. To disable them we put
      // the validator in the elements state.
      this._state = Validator.states.elements;
    } else {
      this._state = Validator.states.segments;
    }
  }
  this._counts.segment += 1;
  this._counts.element = 0;
}

/**
 * @summary Start validation for a new element.
 */
Validator.prototype.onelement = function () {
  var name;

  switch (this._state) {
  case Validator.states.all:
    // Check component count of the previous enter.
    if (this._counts.component < this._element.requires || this._counts.component > this._element.components.length) {
      name = this._segment.elements[this._counts.element];
      throw Validator.errors.countError('Element', name, this._element, this._counts.component);
    }
    // Fall through to continue with element count validation.
  case Validator.states.enter:
    // Skip component count checks for the first element.
  case Validator.states.elements:
    if ((this._element = this._elements[this._segment.elements[this._counts.element]])) {
      this._state = Validator.states.all;
    } else {
      this._state = Validator.states.elements;
    }
  }
  this._counts.element += 1;
  this._counts.component = 0;
}

/**
 * @summary Start validation for a new component.
 * @param {Object} buffer - An object which implements the buffer interface.
 *
 * The buffer object should allow the mode to be set to alpha, numeric or
 * alphanumeric with their corresponding methods.
 */
Validator.prototype.onopencomponent = function (buffer) {
  switch (this._state) {
  case Validator.states.all:
    // Retrieve a component definition if validation is set to all.
    this._component = this.format(this._element.components[this._counts.component]);
    this._minimum = this._component.minimum;
    this._maximum = this._component.maximum;
    // Set the corresponding buffer mode.
    if (this._component.alpha) {
      if (this._component.numeric) {
        buffer.alphanumeric();
      } else {
        buffer.alpha();
      }
    } else {
      if (this._component.numeric) {
        buffer.numeric();
      } else {
        buffer.alphanumeric();
      }
    }
    break;
  default:
    // Set the buffer to it's default mode.
    buffer.alphanumeric();
  }
  this._counts.component += 1;
}

Validator.prototype.onclosecomponent = function (buffer) {
  switch (this._state) {
  case Validator.states.all:
    // Component validation is only needed when validation is set to all.
    if (buffer.length < this._minimum || buffer.length > this._maximum) {
      throw Validator.errors.invalidData(buffer.content());
    }
  }
}

/**
 * @summary Finish validation for the current segment.
 */
Validator.prototype.onclosesegment = function (segment) {
  var name;

  switch (this._state) {
  case Validator.states.all:
    if (this._counts.component < this._element.requires || this._counts.component > this._element.components.length) {
      name = this._segment.elements[this._counts.element];
      throw Validator.errors.countError('Element', name, this._element, this._counts.component);
    }
    // Fall through to continue with element count validation.
  case Validator.states.elements:
    if (this._counts.element < this._segment.requires || this._counts.element > this._segment.elements.length) {
      name = segment;
      throw Validator.errors.countError('Segment', name, this._segment, this._counts.element);
    }
  }
}

Validator.states = {
  // Setting validation to none will disable the validator completely. The
  // validator will not even try to obtain a segment description for segments
  // encountered. Almost all overhead is eliminated in this state.
  none: 0,
  // The segments state implies no segment definition was found for the current
  // segment, so validation should be disabled for its elements and components.
  // Normal validation should be resumed, however, as of the next segment.
  segments: 1,
  // The elements state is equivalent to the segments state, but validation is
  // only temporary disabled for the current element. Normal validation resumes
  // as of the next element.
  elements: 2,
  enter: 4,
  // Validation is enabled for all entities, including segments, elements and
  // components.
  all: 3
};

Validator.errors = {
  invalidData: function (data) {
    var message = '';
    message += 'Could not accept ' + data;
    return new Error(message);
  },
  invalidFormatString: function (formatString) {
    return new Error('Invalid format string ' + formatString);
  },
  countError: function (type, name, definition, count) {
    var array;
    var start = type + ' ' + name, end;
    if (type === 'Segment') {
      array = 'elements';
    } else {
      array = 'components';
    }
    if (count < definition.requires) {
      start += ' only';
      end = ' but requires at least ' + definition.requires;
    } else {
      end = ' but accepts at most ' + definition[array].length;
    }
    return new Error(start + ' got ' + count + ' ' + array + end);
  }
};

module.exports = Validator;
