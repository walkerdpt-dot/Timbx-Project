(function(factory) {
  // See https://github.com/Leaflet/Leaflet/blob/master/PLUGIN-GUIDE.md#standalone-plugin-files
  // for more information about how to write a standalone Leaflet plugin.
  if (typeof define === 'function' && define.amd) {
    // AMD is used - Register as an anonymous module.
    define(['leaflet'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // NodeJS is used - re-export Leaflet components for module loaders
    // and require the Leaflet module.
    module.exports = factory(require('leaflet'));
  } else if (typeof window !== 'undefined') {
    // Finally, run as a browser global.
    if (window.L) {
      factory(window.L);
    }
  }
})(function(L) {
  'use strict';

  L.Control.Geocoder = L.Control.extend({
    options: {
      showResultIcons: false,
      collapsed: true,
      expand: 'touch', // options: touch, click, anythingelse
      position: 'topright',
      placeholder: 'Search...',
      errorMessage: 'Nothing found.',
      iconLabel: 'Initiate search',
      geocoder: null,
      defaultMarkGeocode: true
    },

    includes: L.Evented
      ? L.Evented.prototype
      : L.Mixin.Events,

    initialize: function(options) {
      L.Util.setOptions(this, options);
      if (!this.options.geocoder) {
        this.options.geocoder = new L.Control.Geocoder.Nominatim();
      }
    },

    onAdd: function(map) {
      var className = 'leaflet-control-geocoder',
        container = L.DomUtil.create('div', className + ' leaflet-bar'),
        icon = L.DomUtil.create('button', className + '-icon', container),
        form = (this._form = L.DomUtil.create('div', className + '-form', container));

      this._map = map;
      this._container = container;

      icon.innerHTML = '&nbsp;';
      icon.type = 'button';
      icon.setAttribute('aria-label', this.options.iconLabel);

      var input = (this._input = L.DomUtil.create('input', '', form));
      input.type = 'text';
      input.placeholder = this.options.placeholder;
      L.DomUtil.addClass(input, 'leaflet-control-geocoder-form-input');

      this._errorElement = L.DomUtil.create('div', className + '-form-no-error', container);
      this._errorElement.innerHTML = this.options.errorMessage;

      var results = (this._results = L.DomUtil.create('div', className + '-alternatives', form));
      L.DomUtil.addClass(results, 'leaflet-control-geocoder-alternatives-minimized');

      L.DomEvent.addListener(icon, 'click', this._toggle, this);

      L.DomEvent.addListener(input, 'keydown', this._keydown, this);

      if (this.options.defaultMarkGeocode) {
        this.on('markgeocode', this.markGeocode, this);
      }

      this.on(
        'startgeocode',
        function() {
          L.DomUtil.addClass(this._container, 'leaflet-control-geocoder-throbber');
        },
        this
      );
      this.on(
        'finishgeocode',
        function() {
          L.DomUtil.removeClass(this._container, 'leaflet-control-geocoder-throbber');
        },
        this
      );

      L.DomEvent.disableClickPropagation(container);

      if (this.options.collapsed) {
        if (this.options.expand === 'click') {
          L.DomEvent.addListener(container, 'click', function(e) {
            if (e.button === 0 && e.detail !== 2) {
              this._toggle();
            }
          }, this);
        } else if (L.Browser.touch && this.options.expand === 'touch') {
          L.DomEvent.addListener(container, 'touchstart', this._toggle, this);
        } else {
          L.DomEvent.addListener(container, 'mouseover', this._expand, this);
          L.DomEvent.addListener(container, 'mouseout', this._collapse, this);
        }
      } else {
        this._expand();
        if (L.Browser.touch) {
          L.DomEvent.addListener(container, 'touchstart', L.DomEvent.stopPropagation);
        } else {
          L.DomEvent.addListener(container, 'click', L.DomEvent.stopPropagation);
        }
      }

      return container;
    },

    _geocodeResult: function(results, suggest) {
      L.DomUtil.removeClass(
        this._results,
        'leaflet-control-geocoder-alternatives-minimized'
      );
      this.clearResults();

      if (results.length > 0) {
        L.DomUtil.removeClass(this._errorElement, 'leaflet-control-geocoder-error');
      } else {
        L.DomUtil.addClass(this._errorElement, 'leaflet-control-geocoder-error');
      }

      for (var i = 0; i < results.length; i++) {
        this._createGeocodeResult(results[i]);
      }
    },

    _createGeocodeResult: function(result) {
      var resultView = L.DomUtil.create(
          'li',
          'leaflet-control-geocoder-alternative',
          this._results
        ),
        resultViewLink = L.DomUtil.create('a', '', resultView),
        resultViewImage = this.options.showResultIcons && result.icon
          ? L.DomUtil.create('img', '', resultViewLink)
          : null,
        resultViewName = L.DomUtil.create('span', '', resultViewLink);

      if (resultViewImage) {
        resultViewImage.src = result.icon;
      }

      resultViewName.innerHTML = result.html ? result.html : result.name;
      resultViewLink.href = '#';
      resultViewLink.setAttribute('data-result-index', this._results.childNodes.length - 1);

      // Hover selecting
      L.DomEvent.addListener(
        resultView,
        'mouseover',
        function() {
          if (this._selection) {
            L.DomUtil.removeClass(this._selection, 'leaflet-control-geocoder-alternative-selected');
          }
          L.DomUtil.addClass(resultView, 'leaflet-control-geocoder-alternative-selected');
          this._selection = resultView;
        },
        this
      );

      // Click selecting
      L.DomEvent.addListener(
        resultView,
        'click',
        function(e) {
          L.DomEvent.preventDefault(e);
          this._geocodeResultSelected(result);
          this.fire('markgeocode', { geocode: result });
        },
        this
      );
    },

    markGeocode: function(event) {
      var result = event.geocode;

      this._map.fitBounds(result.bbox);

      if (this._geocodeMarker) {
        this._map.removeLayer(this._geocodeMarker);
      }

      this._geocodeMarker = new L.Marker(result.center)
        .bindPopup(result.html || result.name)
        .addTo(this._map)
        .openPopup();

      return this;
    },

    _keydown: function(e) {
      var _this = this;

      var select = function select(dir) {
        if (_this._selection) {
          L.DomUtil.removeClass(
            _this._selection,
            'leaflet-control-geocoder-alternative-selected'
          );
          _this._selection = _this._results.childNodes[
            (L.DomUtil.getStyle(_this._selection, 'data-result-index') + dir + _this._results.childNodes.length) %
              _this._results.childNodes.length
          ];
          L.DomUtil.addClass(_this._selection, 'leaflet-control-geocoder-alternative-selected');
        } else {
          _this._selection = _this._results.childNodes[0];
          L.DomUtil.addClass(_this._selection, 'leaflet-control-geocoder-alternative-selected');
        }
      };

      switch (e.keyCode) {
        // Up
        case 38:
          select(-1);
          break;
        // Down
        case 40:
          select(1);
          break;
        // Enter
        case 13:
          if (this._selection) {
            var index = parseInt(this._selection.getAttribute('data-result-index'), 10);
            var result = this.options.geocoder.getLastResults()[index];
            this._geocodeResultSelected(result);
            this.fire('markgeocode', { geocode: result });
          } else {
            this._geocode();
          }
          break;
        default:
          return;
      }

      L.DomEvent.preventDefault(e);
    },

    _geocode: function() {
      var query = this._input.value;
      this.fire('startgeocode');
      this.options.geocoder.geocode(
        query,
        function(results) {
          this.fire('finishgeocode');
          this._geocodeResult(results);
        },
        this
      );
    },

    _geocodeResultSelected: function(result) {
      if (this.options.collapsed) {
        this._collapse();
      } else {
        this.clearResults();
      }
      this._input.value = result.name;
    },

    clearResults: function() {
      this._results.innerHTML = '';
      L.DomUtil.addClass(
        this._results,
        'leaflet-control-geocoder-alternatives-minimized'
      );
    },

    _expand: function() {
      L.DomUtil.addClass(this._container, 'leaflet-control-geocoder-expanded');
    },

    _collapse: function() {
      L.DomUtil.removeClass(this._container, 'leaflet-control-geocoder-expanded');
      L.DomUtil.removeClass(this._errorElement, 'leaflet-control-geocoder-error');
      this.clearResults();
    },

    _toggle: function() {
      if (L.DomUtil.hasClass(this._container, 'leaflet-control-geocoder-expanded')) {
        this._collapse();
      } else {
        this._expand();
      }
    }
  });

  L.control.geocoder = function(options) {
    return new L.Control.Geocoder(options);
  };

  L.Control.Geocoder.Nominatim = L.Class.extend({
    options: {
      serviceUrl: 'https://nominatim.openstreetmap.org/',
      geocodingQueryParams: {},
      reverseQueryParams: {},
      htmlTemplate: function(r) {
        var a = r.address,
          parts = [];
        if (a.road || a.building) {
          parts.push('{building} {road} {house_number}');
        }

        if (a.city || a.town || a.village || a.hamlet) {
          parts.push(
            '<span class="' +
              'leaflet-control-geocoder-address-detail' +
              '">{postcode} {city} {town} {village} {hamlet}</span>'
          );
        }

        if (a.state || a.country) {
          parts.push(
            '<span class="' +
              'leaflet-control-geocoder-address-context' +
              '">{state} {country}</span>'
          );
        }

        return L.Control.Geocoder.template(parts.join('<br/>'), a, true);
      }
    },

    initialize: function(options) {
      L.Util.setOptions(this, options);
    },

    geocode: function(query, cb, context) {
      var _this = this;
      L.Control.Geocoder.getJSON(
        this.options.serviceUrl + 'search',
        L.extend(
          {
            q: query,
            limit: 5,
            format: 'json',
            addressdetails: 1
          },
          this.options.geocodingQueryParams
        ),
        function(data) {
          var results = [];
          for (var i = data.length - 1; i >= 0; i--) {
            var bbox = data[i].boundingbox;
            for (var j = 0; j < 4; j++) bbox[j] = parseFloat(bbox[j]);
            results[i] = {
              icon: data[i].icon,
              name: data[i].display_name,
              html: _this.options.htmlTemplate ? _this.options.htmlTemplate(data[i]) : undefined,
              bbox: L.latLngBounds([bbox[0], bbox[2]], [bbox[1], bbox[3]]),
              center: L.latLng(data[i].lat, data[i].lon),
              properties: data[i]
            };
          }
          _this._lastResults = results;
          cb.call(context, results);
        }
      );
    },

    getLastResults: function() {
      return this._lastResults;
    },

    reverse: function(location, scale, cb, context) {
      L.Control.Geocoder.getJSON(
        this.options.serviceUrl + 'reverse',
        L.extend(
          {
            lat: location.lat,
            lon: location.lng,
            zoom: Math.round(Math.log(scale / 256) / Math.log(2)),
            addressdetails: 1,
            format: 'json'
          },
          this.options.reverseQueryParams
        ),
        function(data) {
          var result = [],
            a;
          if (data && data.address) {
            a = data.address;
            result.push({
              name: [
                a.road || '',
                a.house_number || '',
                a.city || '',
                a.country_code ? a.country_code.toUpperCase() : ''
              ]
                .join(' ')
                .trim(),
              center: L.latLng(data.lat, data.lon),
              bounds: L.latLngBounds(L.latLng(data.lat, data.lon), L.latLng(data.lat, data.lon)),
              properties: a
            });
          }

          cb.call(context, result);
        }
      );
    }
  });

  L.Control.Geocoder.nominatim = function(options) {
    return new L.Control.Geocoder.Nominatim(options);
  };

  L.Control.Geocoder.JSONPCbId = 0;
  L.Control.Geocoder.getJSON = function(url, params, callback) {
    var cbId = '_l_geocoder_' + L.Control.Geocoder.JSONPCbId++,
      script;
    params.callback = cbId;
    window[cbId] = function(data) {
      window[cbId] = undefined;
      var head = document.getElementsByTagName('head')[0];
      head.removeChild(script);
      callback(data);
    };

    script = L.DomUtil.create('script', '', document.getElementsByTagName('head')[0]);
    script.type = 'text/javascript';
    script.src = url + L.Util.getParamString(params);
    script.id = cbId;
    L.Control.Geocoder.JSONPCbId++;
  };

  L.Control.Geocoder.template = function(str, data, isHTML) {
    return str.replace(/\{ *([\w_]+) *\}/g, function(str, key) {
      var value = data[key];
      if (value === undefined) {
        value = '';
      } else if (typeof value === 'function') {
        value = value(data);
      }
      return L.Control.Geocoder.htmlEscape(value, isHTML);
    });
  };

  L.Control.Geocoder.htmlEscape = (function() {
    var el = document.createElement('div'),
      NUMBER_OR_PERCENT_REGEX = /%|(\d*\.?\d+(?:[eE][-+]?\d+)?)/g,
      URL_REGEX = /^(?:https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;

    el.appendChild(document.createTextNode(''));

    // Based on https://github.com/janl/mustache.js/blob/master/mustache.js#L94
    // Modified to allow numbers and URL's to pass through without escaping.
    return function(value, isHTML) {
      if (isHTML || (typeof value === 'string' && !value.match(URL_REGEX))) {
        el.firstChild.textContent = value;
        return el.innerHTML.replace(NUMBER_OR_PERCENT_REGEX, '<span>$1</span>');
      } else {
        return value;
      }
    };
  })();

  return L.Control.Geocoder;
});