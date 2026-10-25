// Regenerate against an extracted, unmodified npm archive (not node_modules).
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const original = path.resolve(process.argv[2], 'dist')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const recipe = { version: '0.6.0', files: [] }

for (const name of ['index.mjs', 'index.js', 'index.d.ts', 'index.d.mts']) {
    const source = fs.readFileSync(path.join(original, name), 'utf8')
    const replacements = []
    let prefix = ''
    if (name.endsWith('.ts') || name.endsWith('.mts')) {
        replacements.push([
            '    defaultSelected?: string[];',
            '    defaultSelected?: string[];\n    selected?: string[];\n    dentition?: "adult" | "primary";\n    toothAriaLabel?: (tooth: ToothDetail) => string;',
        ])
        replacements.push([
            '    outlinePath: string;',
            '    outlinePath: string;\n    transform?: string;\n    ariaLabel?: string;',
        ])
    } else {
        const esm = name.endsWith('.mjs')
        prefix = esm
            ? 'import odontogramExtensions from "./dental-booking.cjs";\n'
            : '"use strict";var odontogramExtensions = require("./dental-booking.cjs");\n'
        replacements.push([
            'name:t,outlinePath:',
            'name:t,transform:odontogramTransform,ariaLabel:odontogramAriaLabel,outlinePath:',
        ])
        const selected = esm ? 'h' : 'i',
            readOnly = esm ? 's' : 'h'
        replacements.push([
            'className:`${t} ${' + selected + '?"selected":""}`,',
            'className:`${t} ${' +
                selected +
                '?"selected":""}`,transform:odontogramTransform,"data-tooth":t.replace("teeth-",""),',
        ])
        replacements.push([
            '"aria-label":' +
                readOnly +
                '?void 0:`Tooth ${t.replace("teeth-","")}`',
            '"aria-label":odontogramAriaLabel??(' +
                readOnly +
                '?void 0:`Tooth ${t.replace("teeth-","")}`)',
        ])
        replacements.push([
            'style:{opacity:a?1:void 0}',
            'style:{opacity:a?1:void 0,fill:a?.fillColor}',
        ])
        replacements.push([
            '48:32}',
            '48:32,55:"A",54:"B",53:"C",52:"D",51:"E",61:"F",62:"G",63:"H",64:"I",65:"J",71:"O",72:"N",73:"M",74:"L",75:"K",81:"P",82:"Q",83:"R",84:"S",85:"T"}',
        ])
        if (esm) {
            replacements.push([
                'styles:m})=>{let C=y==="circle"?r1:a1,u=y==="circle"?s1:l1,',
                'styles:m,dentition:odontogramDentition="adult",selected:odontogramSelected,toothAriaLabel:odontogramToothAriaLabel})=>{let odontogramData=y==="circle"?r1:a1,odontogramQuadrants=y==="circle"?s1:l1,C=odontogramDentition==="primary"?odontogramExtensions.primaryTeeth(odontogramData,y):odontogramData,u=odontogramDentition==="primary"?odontogramExtensions.primaryQuadrants(odontogramQuadrants,y):odontogramQuadrants,',
            ])
            replacements.push([
                '[O,m1]=p1(()=>new Set(e?t.slice(0,1):t)),',
                '[odontogramUncontrolled,m1]=p1(()=>new Set(e?t.slice(0,1):t)),O=odontogramSelected===undefined?odontogramUncontrolled:new Set(odontogramSelected),',
            ])
            replacements.push([
                'N=M(o=>{p||m1(l=>{let n=new Set(l);return e?n.has(o)?n.delete(o):(n.clear(),n.add(o)):n.has(o)?n.delete(o):n.add(o),r==null||r(Array.from(n).map(B)),n})},[r,p,B,e])',
                'N=M(o=>{if(p)return;let n=new Set(O);if(e){if(n.has(o))n.delete(o);else{n.clear();n.add(o)}}else if(n.has(o))n.delete(o);else n.add(o);if(odontogramSelected===undefined)m1(n);r?.(Array.from(n).map(B))},[r,p,B,e,O,odontogramSelected])',
            ])
            replacements.push([
                'readOnly:p,...l,name:n,selected:O.has(n)',
                'readOnly:p,...l,name:n,ariaLabel:odontogramToothAriaLabel?.(B(n))??`Tooth ${S}`,selected:O.has(n)',
            ])
            replacements.push([
                '[_,s,J,p,O,N,j,H,E,d,i.placement]',
                '[_,s,J,p,O,N,j,H,E,d,i.placement,B,odontogramToothAriaLabel]',
            ])
        } else {
            replacements.push([
                'styles:C})=>{let d=P==="circle"?a1:n1,f=P==="circle"?p1:s1,',
                'styles:C,dentition:odontogramDentition="adult",selected:odontogramSelected,toothAriaLabel:odontogramToothAriaLabel})=>{let odontogramData=P==="circle"?a1:n1,odontogramQuadrants=P==="circle"?p1:s1,d=odontogramDentition==="primary"?odontogramExtensions.primaryTeeth(odontogramData,P):odontogramData,f=odontogramDentition==="primary"?odontogramExtensions.primaryQuadrants(odontogramQuadrants,P):odontogramQuadrants,',
            ])
            replacements.push([
                '[E,C1]=(0,l.useState)(()=>new Set(e?t.slice(0,1):t)),',
                '[odontogramUncontrolled,C1]=(0,l.useState)(()=>new Set(e?t.slice(0,1):t)),E=odontogramSelected===undefined?odontogramUncontrolled:new Set(odontogramSelected),',
            ])
            replacements.push([
                'I=(0,l.useCallback)(r=>{m||C1(c=>{let n=new Set(c);return e?n.has(r)?n.delete(r):(n.clear(),n.add(r)):n.has(r)?n.delete(r):n.add(r),o==null||o(Array.from(n).map(D)),n})},[o,m,D,e])',
                'I=(0,l.useCallback)(r=>{if(m)return;let n=new Set(E);if(e){if(n.has(r))n.delete(r);else{n.clear();n.add(r)}}else if(n.has(r))n.delete(r);else n.add(r);if(odontogramSelected===undefined)C1(n);o?.(Array.from(n).map(D))},[o,m,D,e,E,odontogramSelected])',
            ])
            replacements.push([
                'readOnly:m,...c,name:n,selected:E.has(n)',
                'readOnly:m,...c,name:n,ariaLabel:odontogramToothAriaLabel?.(D(n))??`Tooth ${O}`,selected:E.has(n)',
            ])
            replacements.push([
                '[J,h,K,m,E,I,_,q,A,u,p.placement]',
                '[J,h,K,m,E,I,_,q,A,u,p.placement,D,odontogramToothAriaLabel]',
            ])
        }
        const view = source.match(
            new RegExp(
                'viewBox:([A-Za-z0-9_$]+)\\(' + (esm ? 'y,g' : 'P,x') + '\\)',
            ),
        )
        if (!view) throw new Error(`Missing viewbox in ${name}`)
        replacements.push([
            view[0],
            `viewBox:odontogramExtensions.viewBox(${view[1]}(${
                esm ? 'y,g' : 'P,x'
            }),odontogramDentition,${esm ? 'y,g' : 'P,x'})`,
        ])
    }
    let patched = source
    for (const [before, after] of replacements) {
        if (patched.split(before).length !== 2)
            throw new Error(
                `Missing or repeated patch pattern in ${name}: ${before}`,
            )
        patched = patched.replace(before, after)
    }
    patched = prefix + patched
    recipe.files.push({
        name,
        beforeHash: hash(source),
        afterHash: hash(patched),
        prefix,
        replacements,
    })
}
fs.writeFileSync(
    path.join(__dirname, '..', 'patches', 'react-odontogram', '0.6.0.json'),
    JSON.stringify(recipe, null, 2) + '\n',
)
