'use strict'

const importUMD = async (url, module = {exports: {}}) => {
    Function('module', 'exports', await (await fetch(url)).text()).call(module, module, module.exports)
    return module.exports
}
const {mat4} = await importUMD('./lib/gl-matrix-min.js');

const main = () => {
    const canvas = document.getElementById("canvas");
    const gl = canvas.getContext("webgl2");

    if (!gl) {
        alert("webgl2 not supported.");
        return;
    }

    if (!gl.getExtension('EXT_color_buffer_float')) {
        alert("Cannot render to floating point textures.");
        return;
    }

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    let particleUpdateProgram;
    {
        const program = createProgram(gl, 'update-vs', 'boid-update-fs');
        particleUpdateProgram = {
            program: program,
            attribs: {
                pos: {
                    loc: gl.getAttribLocation(program, 'pos'),
                    type: gl.FLOAT,
                    size: 2,
                    norm: false,
                }
            },
            uniformUpload: {
                posVelTex: texID => gl.uniform1i(gl.getUniformLocation(program, 'posVelTex'), texID),
                canvasDim: (w, h) => gl.uniform2f(gl.getUniformLocation(program, 'canvasDim'), w, h),
                numParticles: n => gl.uniform1i(gl.getUniformLocation(program, 'numParticles'), n),
                dt: dt => gl.uniform1f(gl.getUniformLocation(program, 'dt'), dt),
            },
            buffers: {
                pos: createQuadBuffer(gl),
            },
            vao: gl.createVertexArray(),
        }

        gl.bindVertexArray(particleUpdateProgram.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, particleUpdateProgram.buffers.pos);
        {
            const pos = particleUpdateProgram.attribs.pos;
            gl.enableVertexAttribArray(pos.loc);
            gl.vertexAttribPointer(
                pos.loc,
                pos.size,
                pos.type,
                pos.norm,
                0,
                0,
            );
        }
    }

    let renderProgram;
    {
        const program = createProgram(gl, 'render-vs', 'render-fs');
        renderProgram = {
            program: program,
            attribs: {},
            uniformUpload: {
                posVelTex: texID => gl.uniform1i(gl.getUniformLocation(program, 'posVelTex'), texID),
                matrix: m => gl.uniformMatrix4fv(gl.getUniformLocation(program, 'matrix'), false, m),
            },
        }
    }

    const particleTexSizes = [
        [10, 10],
        [50, 10],
        [50, 50],
        [100, 100],
        [150, 100],
        [200, 100]
    ]

    const numParticlesSlider = document.getElementById("numParticlesSlider");
    let [texWidth, texHeight] = particleTexSizes[numParticlesSlider.value];
    let numParticles, ins, outs;

    const setupTextures = () => {
        numParticles = texWidth * texHeight;

        const posVel = randomPosVel(numParticles, gl.canvas.width, gl.canvas.height, 5);
        // const posVel = spacedPosVel(texWidth, texHeight, gl.canvas.width, gl.canvas.height)

        const posVelTex1 = createTexture(gl, 4, gl.FLOAT, posVel, texWidth, texHeight);
        const posVelTex2 = createTexture(gl, 4, gl.FLOAT, null, texWidth, texHeight);

        ins = {
            fb: createFrameBuffer(gl, posVelTex1),
            tex: posVelTex1,
        };

        outs = {
            fb: createFrameBuffer(gl, posVelTex2),
            tex: posVelTex2,
        };
    }
    numParticlesSlider.oninput = () => {
        [texWidth, texHeight] = particleTexSizes[numParticlesSlider.value]
        setupTextures();
    }
    setupTextures(texWidth, texHeight);

    let then = 0;
    const FPS_WINDOW = 20;
    const frameTimes = new Array(FPS_WINDOW).fill(0);

    const fps_txt = document.getElementById("fps");

    const render = elapsedMillis => {
        let dt = elapsedMillis / 1000 - then;
        then = elapsedMillis / 1000;

        if (dt > 0.1) dt = 0;

        frameTimes.shift()
        frameTimes.push(dt);
        const fps = FPS_WINDOW / frameTimes.reduce((sum, t) => sum + t);
        fps_txt.textContent = `${numParticles} @ ${Math.round(fps).toString()}fps`;

        // position updating
        gl.bindFramebuffer(gl.FRAMEBUFFER, outs.fb);
        gl.viewport(0, 0, texWidth, texHeight);

        gl.bindVertexArray(particleUpdateProgram.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, ins.tex);

        gl.useProgram(particleUpdateProgram.program);
        particleUpdateProgram.uniformUpload.posVelTex(0);
        particleUpdateProgram.uniformUpload.canvasDim(gl.canvas.width, gl.canvas.height);
        particleUpdateProgram.uniformUpload.numParticles(numParticles);
        particleUpdateProgram.uniformUpload.dt(dt);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // rendering
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, outs.tex);

        const mat = mat4.create();
        mat4.ortho(mat, 0, gl.canvas.width, 0, gl.canvas.height, -1, 1);

        gl.useProgram(renderProgram.program);
        renderProgram.uniformUpload.posVelTex(0);
        renderProgram.uniformUpload.matrix(mat);

        gl.clearColor(0.02, 0.02, 0.02, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.drawArrays(gl.POINTS, 0, numParticles);

        {
            const temp = ins;
            ins = outs;
            outs = temp;
        }

        requestAnimationFrame(render)
    };
    requestAnimationFrame(render);

};

const rand = (min, max) => Math.random() * (max - min) + min;

const randomPosVel = (numParticles, width, height, maxSpeed) => {
    const posVel = [];
    for (let i = 0; i < numParticles; i++) {
        posVel.push(
            rand(0, width), rand(0, height),
            rand(-maxSpeed, maxSpeed), rand(-maxSpeed, maxSpeed),
        );
    }
    return new Float32Array(posVel);
}

const spacedPosVel = (texWidth, texHeight, width, height) => {
    const posVel = [];
    for (let x = 0; x < texWidth; x++) {
        for (let y = 0; y < texHeight; y++) {
            posVel.push(
                (width / (texWidth + 1)) * (x + 1), (height / (texHeight + 1)) * (y + 1),
                0, 0
            )
        }
    }
    return new Float32Array(posVel);
}

const createTexture = (gl, channels, type, data, width, height) => {
    const tex = gl.createTexture();
    const [internalFormat, format] = getFormats(gl, type, channels);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        width,
        height,
        0,
        format,
        type,
        data
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

const getFormats = (gl, type, channels) => {
    const intFormats = [
        [gl.R32I, gl.RED_INTEGER],
        [gl.RG32I, gl.RG_INTEGER],
        [gl.RGB32I, gl.RGB_INTEGER],
        [gl.RGBA32I, gl.RGBA_INTEGER],
    ];
    const floatFormats = [
        [gl.R32F, gl.RED],
        [gl.RG32F, gl.RG],
        [gl.RGB32F, gl.RGB],
        [gl.RGBA32F, gl.RGBA],
    ];

    if (![1, 2, 3, 4].includes(channels)) throw `invalid number of channels (${channels}) for texture`

    let internalFormat, format;
    if (type === gl.INT) {
        internalFormat = intFormats[channels - 1][0];
        format = intFormats[channels - 1][1];
    } else if (type === gl.FLOAT) {
        internalFormat = floatFormats[channels - 1][0];
        format = floatFormats[channels - 1][1];
    } else throw `invalid texture data type ${type}`;
    return [internalFormat, format];
}

const createQuadBuffer = (gl) => {
    return createBuffer(gl, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
}

const createBuffer = (gl, dataOrSize, usage) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, dataOrSize, usage);
    return buffer;
}

const createFrameBuffer = (gl, tex) => {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fb;
}

const readFB = (gl, fb, type, channels, w, h, log = false) => {
    const [_, format] = getFormats(gl, type, channels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    let res;
    if (type === gl.INT) res = new Int32Array(w * h * channels);
    else if (type === gl.FLOAT) res = new Float32Array(w * h * channels);
    else throw `invalid framebuffer data type ${type}`

    gl.readPixels(0, 0, w, h, format, type, res);

    if (log) {
        console.log(res);
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

main();
