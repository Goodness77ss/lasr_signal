import {configDefaults,defineConfig} from 'vitest/config';

// Private runtime contains backups and packaged source snapshots, not live tests.
export default defineConfig({test:{exclude:[...configDefaults.exclude,'**/.runtime/**']}});
