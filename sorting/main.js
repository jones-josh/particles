const main = () => compareSorts();

function bitonic() {
    const canvas = document.getElementById("canvas")
    const gl = canvas.getContext('webgl2');

    if (!gl.getExtension('EXT_color_buffer_float')) {
        alert("Cannot render to floating point textures.");
        stop()
    }

    const size = 9;
    const [w, h] = [2**size, 2**size];
    const arr = Array.from(Array(w * h), _ => Math.random())

    // console.log(arr)
    const then = performance.now()
    const state = initBitonicSort(gl, w, h, arr, size);
    for (let i = 0; i < 100; i++) bitonicSort(state, false);
    console.log(`${(performance.now() - then)/100}ms`)
}

const compareSorts = () => {
    const canvas = document.getElementById("canvas")
    const gl = canvas.getContext('webgl2');

    if (!gl.getExtension('EXT_color_buffer_float')) {
        alert("Cannot render to floating point textures.");
        stop()
    }

    const MAX_VAL = 100;
    const COUNT = 100;

    const upperBound = prompt("Enter array length upper bound");
    const toTest = prompt("Testing? (cpu,merge,idx,oe,cpu-rw,all)");

    const dims = [];
    let [_w, _h] = [1, 1];
    while (_w * _h <= upperBound) {
        dims.push([_w, _h]);
        if (_h < _w) _h *= 2
        else _w *= 2
    }
    const arrs = dims.map(([w, h]) => Array.from(Array(w * h), _ => Math.round(rand(0, MAX_VAL))))
    let times;

    if (toTest.includes('cpu') || toTest.includes('all')) {
        times = [];
        console.log("-----sorting with cpu-----");
        for (let i = 0; i < dims.length; i++) {
            let then = performance.now()
            const [w, h] = dims[i];
            const state = initCpuSort(arrs[i], COUNT)
            const initTime = performance.now() - then;
            then = performance.now();
            for (let j = 0; j < COUNT; j++) cpuSort(state, j);
            const runtime = (performance.now() - then) / COUNT;
            times.push(runtime);
            console.log(`${w * h}: init ${initTime}ms, exec ${runtime}ms`)
        }
        console.log(`times: [${times}]`);
    }

    if (toTest.includes('idx') || toTest.includes('all')) {
        times = [];
        console.log("-----sorting with gpu (idx)-----");
        for (let i = 0; i < dims.length; i++) {
            let then = performance.now()
            const [w, h] = dims[i];
            const state = initIndexSort(gl, w, h, arrs[i]);
            const initTime = performance.now() - then;
            then = performance.now();
            for (let j = 0; j < COUNT; j++) indexSort(state);
            const runtime = (performance.now() - then) / COUNT;
            times.push(runtime);
            console.log(`${w * h}: init ${initTime}ms, exec ${runtime}ms`)
        }
        console.log(`times: [${times}]`);
    }

    if (toTest.includes('oe') || toTest.includes('all')) {
        times = [];
        console.log("-----sorting with gpu (odd-even)-----");
        for (let i = 0; i < dims.length; i++) {
            let then = performance.now()
            const [w, h] = dims[i];
            const state = initOddEvenSort(gl, w, h, arrs[i]);
            const initTime = performance.now() - then;
            then = performance.now();
            for (let j = 0; j < COUNT; j++) oddEvenSort(state);
            const runtime = (performance.now() - then) / COUNT;
            times.push(runtime);
            console.log(`${w * h}: init ${initTime}ms, exec ${runtime}ms`)
        }
        console.log(`times: [${times}]`);
    }

    if (toTest.includes('merge') || toTest.includes('all')) {
        times = [];
        console.log("-----sorting with gpu (merge)-----");
        for (let i = 0; i < dims.length; i++) {
            let then = performance.now()
            const [w, h] = dims[i];
            const state = initMergeSort(gl, w, h, arrs[i]);
            const initTime = performance.now() - then;
            then = performance.now();
            for (let j = 0; j < COUNT; j++) mergeSort(state);
            const runtime = (performance.now() - then) / COUNT;
            times.push(runtime);
            console.log(`${w * h}: init ${initTime}ms, exec ${runtime}ms`)
        }
        console.log(`times: [${times}]`);
    }

    if (toTest.includes('cpu-rw') || toTest.includes('all')) {
        times = [];
        console.log("-----sorting with cpu (with texture writing)-----");
        for (let i = 0; i < dims.length; i++) {
            let then = performance.now()
            const [w, h] = dims[i];
            const state = initOddEvenSort(gl, w, h, arrs[i]);
            const initTime = performance.now() - then;
            then = performance.now();
            for (let j = 0; j < COUNT; j++) {
                const a = readFB(gl, state.ins.fb, w, h, 0, false);
                a.sort();

                const sortTime = performance.now() - then;

                gl.bindTexture(gl.TEXTURE_2D, state.ins.tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, new Float32Array(a));
                gl.finish();
            }
            const runtime = (performance.now() - then) / COUNT;
            console.log(`${w * h}: init ${initTime}ms, exec ${runtime}ms`);
            // console.log(a)
            times.push(runtime);
        }
        console.log(`times: [${times}]`);
    }
}

const initCpuSort = (values, count) => {
    const arrs = [];
    for (let i = 0; i < count; i++) {
        arrs[i] = values.slice();
    }
    return {
        arrs: arrs,
    }
}

const cpuSort = (state, i) => {
    state.arrs[i].sort();
}

const initIndexSort = (gl, w, h, values) => {
    let idxProgram;
    {
        const program = createProgram(gl, "vs", "new-idx-fs");
        idxProgram = {
            program: program,
            attribs: {
                pos: {
                    loc: gl.getAttribLocation(program, "pos"),
                }
            },
            uniforms: {
                srcTex: texID => gl.uniform1i(gl.getUniformLocation(program, 'srcTex'), texID),
            }
        }
    }

    let valProgram;
    {
        const program = createProgram(gl, "vs", "new-val-fs");
        valProgram = {
            program: program,
            attribs: {
                pos: {
                    loc: gl.getAttribLocation(program, "pos"),
                }
            },
            uniforms: {
                srcTex: texID => gl.uniform1i(gl.getUniformLocation(program, 'srcTex'), texID),
                idxTex: texID => gl.uniform1i(gl.getUniformLocation(program, 'idxTex'), texID),
            }
        }
    }

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
    ]), gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    gl.enableVertexAttribArray(idxProgram.attribs.pos);
    gl.vertexAttribPointer(
        idxProgram.attribs.pos,
        2,
        gl.FLOAT,
        false,
        0,
        0,
    );

    const data = [];
    for (let i = 0; i < w * h; i++) {
        data.push(values[i]);
    }
    const inTex = createTexture(gl, new Float32Array(data), w, h);
    const idxTex = createTexture(gl, null, w, h);
    const outTex = createTexture(gl, null, w, h);

    const inFB = createFrameBuffer(gl, inTex);
    const idxFB = createFrameBuffer(gl, idxTex);
    const outFB = createFrameBuffer(gl, outTex);

    return {
        gl: gl,
        idxProgram: idxProgram,
        valProgram: valProgram,
        w: w,
        h: h,
        fb: {
            in: inFB,
            idx: idxFB,
            out: outFB,
        },
        tex: {
            in: inTex,
            idx: idxTex,
            out: outTex,
        },
    }
}

const indexSort = (state, print = false) => {
    const gl = state.gl;
    const idxProgram = state.idxProgram;
    const valProgram = state.valProgram;
    gl.useProgram(idxProgram.program);

    gl.bindFramebuffer(gl.FRAMEBUFFER, state.fb.idx);
    gl.viewport(0, 0, state.w, state.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.tex.in);

    idxProgram.uniforms.srcTex(0);  // tell the shader the src texture is on texture unit 0

    gl.drawArrays(gl.TRIANGLES, 0, 6);  // draw 2 triangles (6 vertices)

    gl.useProgram(valProgram.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.fb.out);
    gl.viewport(0, 0, state.w, state.h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.tex.in);
    valProgram.uniforms.srcTex(0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.tex.idx);
    valProgram.uniforms.idxTex(1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.finish();
    if (print) {
        readFB(gl, state.fb.in, state.w, state.h);
        readFB(gl, state.fb.out, state.w, state.h);
    }
}

const initOddEvenSort = (gl, w, h, values) => {
    let program;
    {
        const prg = createProgram(gl, "vs", "odd-even-fs");
        program = {
            program: prg,
            attribs: {
                pos: {
                    los: gl.getAttribLocation(prg, "pos"),
                }
            },
            uniforms: {
                even: even => gl.uniform1i(gl.getUniformLocation(prg, "even"), even),
                inTex: texID => gl.uniform1i(gl.getUniformLocation(prg, "inTex"), texID),
            }
        }
    }

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
    ]), gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(program.attribs.pos);
    gl.vertexAttribPointer(program.attribs.pos, 2, gl.FLOAT, false, 0, 0);

    const data = [];
    for (let i = 0; i < w * h; i++) {
        data.push(values[i]);
    }
    const inTex = createTexture(gl, new Float32Array(data), w, h);
    const outTex = createTexture(gl, null, w, h);

    const inFB = createFrameBuffer(gl, inTex);
    const outFB = createFrameBuffer(gl, outTex);

    gl.finish();

    return {
        gl: gl,
        program: program,
        w: w,
        h: h,
        ins: {
            tex: inTex,
            fb: inFB,
        },
        outs: {
            tex: outTex,
            fb: outFB,
        }
    }
}

const oddEvenSort = (state, print = false) => {
    const {gl, program} = state;
    gl.useProgram(program.program);

    let even = 1;

    for (let i = 0; i < state.w * state.h; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.outs.fb);
        gl.viewport(0, 0, state.w, state.h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.ins.tex);
        program.uniforms.inTex(0);
        program.uniforms.even(even);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        even = even === 1 ? 0 : 1;

        {
            const tmp = state.ins;
            state.ins = state.outs;
            state.outs = tmp;
        }
    }
    gl.finish();
    if (print) {
        readFB(gl, state.outs.fb, state.w, state.h);
    }
}

const initBitonicSort = (gl, w, h, values, size) => {
    let program;
    {
        const prg = createProgram(gl, "vs", "bitonic-fs");
        program = {
            program: prg,
            attribs: {
                pos: {
                    los: gl.getAttribLocation(prg, "pos"),
                }
            },
            uniforms: {
                blockStep: x => gl.uniform1ui(gl.getUniformLocation(prg, "blockStep"), x),
                subBlockStep: x => gl.uniform1ui(gl.getUniformLocation(prg, "subBlockStep"), x),
                size: x => gl.uniform1ui(gl.getUniformLocation(prg, "size"), x),
                inTex: texID => gl.uniform1i(gl.getUniformLocation(prg, "inTex"), texID),
            }
        }
    }

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
    ]), gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(program.attribs.pos);
    gl.vertexAttribPointer(program.attribs.pos, 2, gl.FLOAT, false, 0, 0);

    const data = [];
    for (let i = 0; i < w * h; i++) {
        data.push(values[i]);
    }
    const inTex = createTexture(gl, new Float32Array(data), w, h);
    const outTex = createTexture(gl, null, w, h);

    const inFB = createFrameBuffer(gl, inTex);
    const outFB = createFrameBuffer(gl, outTex);

    gl.finish();

    return {
        gl: gl,
        program: program,
        w: w,
        h: h,
        ins: {
            tex: inTex,
            fb: inFB,
        },
        outs: {
            tex: outTex,
            fb: outFB,
        },
        size: size,
    }
}

const bitonicSort = (state, print=false) => {
    const {gl, program} = state;
    gl.useProgram(program.program);
    // console.log(state)
    const sizeN = state.size * 2;
    for (let i = 0; i < sizeN; i++) {
        for (let j = 0; j <= i; j++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, state.outs.fb);
            gl.viewport(0, 0, state.w, state.h);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, state.ins.tex);
            program.uniforms.inTex(0);
            program.uniforms.size(2**state.size);
            program.uniforms.blockStep(i);
            program.uniforms.subBlockStep(j);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            {
                const tmp = state.ins;
                state.ins = state.outs;
                state.outs = tmp;
            }
        }
    }

    gl.finish();
    if (print) {
        readFB(gl, state.outs.fb, state.w, state.h, 3);
    }
}

const mergeSort = (state, print = false) => {
    const {gl, program} = state;
    gl.useProgram(program.program);


    for (let level = 0; level <= Math.ceil(Math.log2(state.w * state.h)); level++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.outs.fb);
        gl.viewport(0, 0, state.w, state.h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.ins.tex);
        program.uniforms.inTex(0);
        program.uniforms.level(level);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        {
            const tmp = state.ins;
            state.ins = state.outs;
            state.outs = tmp;
        }
    }
    gl.finish();
    if (print) {
        readFB(gl, state.outs.fb, state.w, state.h);
    }
}

const initMergeSort = (gl, w, h, values) => {
    let program;
    {
        const prg = createProgram(gl, "vs", "merge-fs");
        program = {
            program: prg,
            attribs: {
                pos: {
                    los: gl.getAttribLocation(prg, "pos"),
                }
            },
            uniforms: {
                level: level => gl.uniform1i(gl.getUniformLocation(prg, "level"), level),
                inTex: texID => gl.uniform1i(gl.getUniformLocation(prg, "inTex"), texID),
            }
        }
    }

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
    ]), gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(program.attribs.pos);
    gl.vertexAttribPointer(program.attribs.pos, 2, gl.FLOAT, false, 0, 0);

    const data = [];
    for (let i = 0; i < w * h; i++) {
        data.push(values[i]);
    }
    const inTex = createTexture(gl, new Float32Array(data), w, h);
    const outTex = createTexture(gl, null, w, h);

    const inFB = createFrameBuffer(gl, inTex);
    const outFB = createFrameBuffer(gl, outTex);

    gl.finish();

    return {
        gl: gl,
        program: program,
        w: w,
        h: h,
        ins: {
            tex: inTex,
            fb: inFB,
        },
        outs: {
            tex: outTex,
            fb: outFB,
        }
    }
}

const readFB = (gl, fb, w, h, dp = 0, log = true) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const res = new Float32Array(w * h);
    gl.readPixels(0, 0, w, h, gl.RED, gl.FLOAT, res);

    if (log) {
        const values = [];
        for (let i = 0; i < w * h; i++) {
            values.push((res[i]).toFixed(dp));
        }
        console.log(`[${values.join(",")}]`);
    }
    return res;
}

const createProgram = (gl, vs, fs, varyings = null) => {
    const program = gl.createProgram();

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vs);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fs);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    if (varyings !== null) gl.transformFeedbackVaryings(program, varyings, gl.SEPARATE_ATTRIBS);
    gl.linkProgram(program);

    const status = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!status) throw `Linking failed:\n${gl.getProgramInfoLog(program)}`;

    return program;
}

const createShader = (gl, type, sourceId) => {
    const source = document.getElementById(sourceId).text.trim();
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const status = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!status) throw `${sourceId} compile failed:\n${gl.getShaderInfoLog(shader)}`;
    return shader;
};

const createTexture = (gl, data, width, height) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R32F,
        width,
        height,
        0,
        gl.RED,
        gl.FLOAT,
        data
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

const createFrameBuffer = (gl, tex) => {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fb;
}

const rand = (min, max) => (Math.random() * (max - min) + min);

main();
