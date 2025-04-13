// build.js
import fs from 'fs/promises';
import path from 'path';
import { transform, browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';

// --- Rollup Imports ---
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve'; // Locates modules in node_modules
import commonjs from '@rollup/plugin-commonjs';          // Converts CommonJS modules to ES modules
import terser from '@rollup/plugin-terser';             // Minifies the final bundle

// --- Configuration ---
const INPUT_JS_FILE = 'multi-file-upload-component.js'; // Your component entry point
const OUTPUT_JS_FILE = 'dist/multi-file-upload-component.min.js'; // Final bundled output
const TEMP_JS_FILE_WITH_MINIFIED_CSS = 'temp-component-with-minified-css.js'; // Intermediate file (will be deleted)
const BROWSER_TARGETS = '>= 0.5% and last 2 versions and not dead'; // For CSS processing

// Rollup output format: 'iife' (Immediately Invoked Function Expression) is good for <script> tags.
// It wraps the code to avoid polluting the global scope.
const OUTPUT_FORMAT = 'iife';
// const OUTPUT_GLOBAL_NAME = 'MultiFileUploadComponent'; // Optional: Uncomment and set if format is 'iife'/'umd' and you need a global variable

// --- End Configuration ---

const inputPath = path.resolve(INPUT_JS_FILE);
const tempPath = path.resolve(TEMP_JS_FILE_WITH_MINIFIED_CSS);
const outputPath = path.resolve(OUTPUT_JS_FILE);

async function build() {
    console.log(`Starting build for ${INPUT_JS_FILE}...`);

    try {
        // === Step 1: Process CSS (Extract from JS, Minify, Replace) ===
        console.log('Reading original JS and processing embedded CSS...');
        const originalJsContent = await fs.readFile(inputPath, 'utf-8');
        let jsContentForBundling = originalJsContent; // Start with original content

        const styleRegex = /<style>([\s\S]*?)<\/style>/;
        const styleMatch = originalJsContent.match(styleRegex);

        if (styleMatch && styleMatch[1]) {
            const originalCssContent = styleMatch[1];
            const originalStyleBlock = styleMatch[0]; // Includes <style> tags
            console.log('Found <style> block, attempting CSS minification...');

            try {
                let targets = browserslistToTargets(browserslist(BROWSER_TARGETS));
                let { code: minifiedCssBuffer } = transform({
                    filename: 'embedded.css', // Dummy filename for LightningCSS
                    code: Buffer.from(originalCssContent),
                    minify: true,
                    targets: targets,
                    // sourceMap: true, // Uncomment if you want CSS source maps
                });
                const minifiedCss = minifiedCssBuffer.toString();
                console.log(`CSS minified successfully (${originalCssContent.length} -> ${minifiedCss.length} bytes).`);

                // Replace the original style block with the minified version
                jsContentForBundling = originalJsContent.replace(
                    originalStyleBlock,
                    `<style>${minifiedCss}</style>`
                );
            } catch (cssError) {
                console.error('Error during CSS minification:', cssError);
                console.warn('Proceeding with unminified CSS due to error.');
            }
        } else {
            console.log('No <style> block found or content empty. Skipping CSS minification.');
        }

        // Write the JS with potentially minified CSS to a temporary file for Rollup
        console.log(`Writing intermediate JS (with processed CSS) to ${TEMP_JS_FILE_WITH_MINIFIED_CSS}`);
        await fs.writeFile(tempPath, jsContentForBundling);

        // === Step 2: Bundle and Minify JavaScript using Rollup ===
        console.log(`Bundling JavaScript dependencies starting from ${TEMP_JS_FILE_WITH_MINIFIED_CSS}...`);

        const bundle = await rollup({
            input: tempPath, // Use the temporary file as input
            plugins: [
                nodeResolve({
                    // *** THIS IS THE KEY FIX ***
                    // Tells the plugin to respect the "browser" field in package.json
                    // files (like the one in tus-js-client) to use browser-specific versions
                    // of modules, avoiding Node.js built-in dependencies.
                    browser: true
                }),
                commonjs(),    // Converts CommonJS modules (if any) to ES modules
                terser({       // Minifies the final bundle
                    compress: true,
                    mangle: true,
                    // You can add more terser options here if needed
                    // format: {
                    //   comments: false // Example: remove comments
                    // }
                })
            ],
            // Optional: Uncomment if you encounter warnings about circular dependencies
            // circularDependencyOption: 'warn'
        });

        console.log('Generating bundled output...');
        await bundle.write({
            file: outputPath,
            format: OUTPUT_FORMAT,
            // name: OUTPUT_GLOBAL_NAME, // Define if you need the bundle to expose a global variable
            sourcemap: false // Set to true or 'inline' if you want a JS source map
        });

        // Close the bundle to free up resources
        await bundle.close();

        console.log(`Bundle successful! Output written to ${OUTPUT_JS_FILE}`);

    } catch (error) {
        console.error('\n--- BUILD FAILED ---');
        console.error(error);
        process.exit(1); // Exit with error code
    } finally {
         // === Step 3: Clean up the temporary file ===
         try {
            await fs.unlink(tempPath);
            console.log(`Cleaned up temporary file: ${TEMP_JS_FILE_WITH_MINIFIED_CSS}`);
         } catch (cleanupError) {
             // Don't fail the build if cleanup fails, but log a warning
             // Ignore error if the file simply doesn't exist (e.g., if build failed before creating it)
             if (cleanupError.code !== 'ENOENT') {
                 console.warn(`Warning: Could not clean up temporary file ${tempPath}:`, cleanupError.message);
             }
         }
    }
}

// Run the build function
build();