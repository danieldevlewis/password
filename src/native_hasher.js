/*!
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Password Hasher
 *
 * The Initial Developer of the Original Code is Steve Cooper.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): (none)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 */

async function encodeKey(key) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign', 'verify'],
  );
}

async function b64HmacSha1(key, data) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  const signed = await window.crypto.subtle.sign(
    'HMAC',
    await encodeKey(key),
    encoded,
  );
  return btoa(String.fromCharCode(...new Uint8Array(signed))).replace(
    /=*$/,
    '',
  );
}

/*
 * This is a very specialized method to inject a character chosen from a
 * range of character codes into a block at the front of a string if one of
 * those characters is not already present.
 * Parameters:
 *  sInput   = input string
 *  offset   = offset for position of injected character
 *  reserved = # of offsets reserved for special characters
 *  seed   = seed for pseudo-randomizing the position and injected character
 *  lenOut   = length of head of string that will eventually survive truncation.
 *  cStart   = character code for first valid injected character.
 *  cNum   = number of valid character codes starting from cStart.
 */
function injectSpecialCharacter(
  sInput,
  offset,
  reserved,
  seed,
  lenOut,
  cStart,
  cNum,
) {
  const pos0 = seed % lenOut;
  const pos = (pos0 + offset) % lenOut;
  // Check if a qualified character is already present
  // Write the loop so that the reserved block is ignored.
  for (let i = 0; i < lenOut - reserved; i += 1) {
    const i2 = (pos0 + reserved + i) % lenOut;
    const c = sInput.charCodeAt(i2);
    if (c >= cStart && c < cStart + cNum) {
      return sInput;
    } // Already present - nothing to do
  }
  const sHead = pos > 0 ? sInput.substring(0, pos) : '';
  const sInject = String.fromCharCode(
    ((seed + sInput.charCodeAt(pos)) % cNum) + cStart,
  );
  const sTail =
    pos + 1 < sInput.length ? sInput.substring(pos + 1, sInput.length) : '';
  return sHead + sInject + sTail;
}

/*
 * Another specialized method to replace a class of character, e.g.
 * punctuation, with plain letters and numbers.
 * Parameters:
 *  sInput = input string
 *  seed   = seed for pseudo-randomizing the position and injected character
 *  lenOut = length of head of string that will eventually survive truncation.
 */
function removeSpecialCharacters(sInput, seed, lenOut) {
  let s = '';
  let i = 0;
  while (i < lenOut) {
    const j = sInput.substring(i).search(/[^a-z0-9]/i);
    if (j < 0) {
      break;
    }
    if (j > 0) {
      s += sInput.substring(i, i + j);
    }
    s += String.fromCharCode(((seed + i) % 26) + 65);
    i += j + 1;
  }
  if (i < sInput.length) {
    s += sInput.substring(i);
  }
  return s;
}

/*
 * Convert input string to digits-only.
 * Parameters:
 *  sInput = input string
 *  seed   = seed for pseudo-randomizing the position and injected character
 *  lenOut = length of head of string that will eventually survive truncation.
 */
function convertToDigits(sInput, seed, lenOut) {
  let s = '';
  let i = 0;
  while (i < lenOut) {
    const j = sInput.substring(i).search(/[^0-9]/i);
    if (j < 0) {
      break;
    }
    if (j > 0) {
      s += sInput.substring(i, i + j);
    }
    s += String.fromCharCode(((seed + sInput.charCodeAt(i)) % 10) + 48);
    i += j + 1;
  }
  if (i < sInput.length) {
    s += sInput.substring(i);
  }
  return s;
}

/*
 * IMPORTANT: This function should be changed carefully.  It must be
 * completely deterministic and consistent between releases.  Otherwise
 * users would be forced to update their passwords.  In other words, the
 * algorithm must always be backward-compatible.  It's only acceptable to
 * violate backward compatibility when new options are used.
 * SECURITY: The optional adjustments are positioned and calculated based
 * on the sum of all character codes in the raw hash string.  So it becomes
 * far more difficult to guess the injected special characters without
 * knowing the master key.
 */
export default async function hash({
  siteTag,
  masterKey,
  hashWordSize,
  requireDigit,
  requirePunctuation,
  requireMixedCase,
  restrictSpecial,
  restrictDigits,
  bangify,
}) {
  // Start with the SHA1-encrypted master key/site tag.
  let s = await b64HmacSha1(masterKey, siteTag);
  // Use the checksum of all characters as a pseudo-randomizing seed to
  // avoid making the injected characters easy to guess.  Note that it
  // isn't random in the sense of not being deterministic (i.e.
  // repeatable).  Must share the same seed between all injected
  // characters so that they are guaranteed unique positions based on
  // their offsets.
  let sum = 0;
  for (let i = 0; i < s.length; i += 1) {
    sum += s.charCodeAt(i);
  }
  // Restrict digits just does a mod 10 of all the characters
  if (restrictDigits) {
    s = convertToDigits(s, sum, hashWordSize);
  } else {
    // Inject digit, punctuation, and mixed case as needed.
    if (requireDigit) {
      s = injectSpecialCharacter(s, 0, 4, sum, hashWordSize, 48, 10);
    }
    if (requirePunctuation && !restrictSpecial) {
      s = injectSpecialCharacter(s, 1, 4, sum, hashWordSize, 33, 15);
    }
    if (requireMixedCase) {
      s = injectSpecialCharacter(s, 2, 4, sum, hashWordSize, 65, 26);
      s = injectSpecialCharacter(s, 3, 4, sum, hashWordSize, 97, 26);
    }
    // Strip out special characters as needed.
    if (restrictSpecial) {
      s = removeSpecialCharacters(s, sum, hashWordSize);
    }
  }

  // Trim it to size
  s = s.substring(0, hashWordSize);

  // Add a bang at the end
  if (bangify) {
    s = s.replace(/.$/, '!');
  }

  return s;
}
