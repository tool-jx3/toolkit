        const canvas = document.getElementById('drawCanvas');
        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let pathPoints = [];
        let currentShapeMode = 'custom';

        // UI Elements
        const inputTextEl = document.getElementById('inputText');
        const outputTextEl = document.getElementById('outputText');
        const gridSizeEl = document.getElementById('gridSize');
        const gridSizeLabel = document.getElementById('gridSizeLabel');
        const densitySlider = document.getElementById('densitySlider');
        const densityLabel = document.getElementById('densityLabel');
        const spaceCharEl = document.getElementById('spaceChar');
        const twitterOptEl = document.getElementById('twitterOpt');
        const drawHint = document.getElementById('drawHint');
        const charCountEl = document.getElementById('charCount');
        const outputCharCountEl = document.getElementById('outputCharCount');

        // 即時更新輸入的字數
        function updateCharCount() {
            const rawText = inputTextEl.value;
            const textChars = rawText.replace(/\s+/g, ''); 
            charCountEl.textContent = textChars.length;
        }

        inputTextEl.addEventListener('input', updateCharCount);

        // Resize Canvas to fit container
        function resizeCanvas() {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            redrawPath();
        }

        // 依目前間距滑桿數值算出對應的間距描述字，並更新標籤文字
        function densityDescriptorKey(val) {
            if (val <= 0.8) return 'density.veryTight';
            if (val <= 1.1) return 'density.tight';
            if (val <= 1.3) return 'density.normal';
            if (val <= 1.8) return 'density.loose';
            return 'density.veryLoose';
        }

        function renderDensityLabel() {
            const val = parseFloat(densitySlider.value);
            densityLabel.textContent = `${T(densityDescriptorKey(val))} (${val.toFixed(1)})`;
        }

        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('load', () => {
            resizeCanvas();
            // 預設範例文字
            inputTextEl.value = T('sample.defaultText');
            updateCharCount(); // 反映初始字數
            setShape('circle'); // 依需求將預設形狀設為圓形
            renderDensityLabel(); // 以目前語言呈現初始間距標籤
        });

        // Grid size slider event
        gridSizeEl.addEventListener('input', (e) => {
            gridSizeLabel.textContent = e.target.value;
        });

        // 自動調整間距滑桿事件
        densitySlider.addEventListener('input', (e) => {
            renderDensityLabel();

            // 若已產生結果，即時依新間距重新調整並算繪
            if (outputTextEl.value.trim() !== '' && pathPoints.length > 1) {
                autoScalePath(true); // 靜默處理，避免重複跳出提示訊息
            }
        });

        // Twitter 選項核取方塊事件
        twitterOptEl.addEventListener('change', (e) => {
            // 若已有結果，立即重新產生
            if (outputTextEl.value.trim() !== '' && pathPoints.length > 1) {
                generateText();
            }
        });

        // 空白字元變更時立即重新產生
        spaceCharEl.addEventListener('change', () => {
            if (outputTextEl.value.trim() !== '' && pathPoints.length > 1) {
                generateText();
            }
        });

        function startDrawing(e) {
            if (currentShapeMode !== 'custom') {
                setShape('custom');
            }
            isDrawing = true;
            pathPoints = []; // Clear previous path
            drawHint.style.display = 'none';
            addPoint(e);
        }

        function draw(e) {
            if (!isDrawing) return;
            addPoint(e);
            redrawPath();
        }

        function stopDrawing() {
            isDrawing = false;
        }

        function addPoint(e) {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;

            // Handle both touch and mouse events
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            const x = clientX - rect.left;
            const y = clientY - rect.top;
            
            // Prevent duplicate adjacent points to optimize path
            if (pathPoints.length > 0) {
                const lastPoint = pathPoints[pathPoints.length - 1];
                const dist = Math.hypot(x - lastPoint.x, y - lastPoint.y);
                if (dist < 2) return; // Ignore very small movements
            }
            
            pathPoints.push({ x, y });
        }

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);

        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); }, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);

        function clearCanvas() {
            pathPoints = [];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawHint.style.display = 'flex';
            outputTextEl.value = '';
            outputCharCountEl.textContent = '0';
            setShape('custom');
        }

        // 反轉軌跡方向功能
        function reversePath() {
            if (pathPoints.length > 0) {
                pathPoints.reverse(); // 反轉陣列順序
                redrawPath();

                // 若文字結果已產生，反轉方向後立即重新產生並顯示
                if (outputTextEl.value.trim() !== '') {
                    generateText();
                }
            } else {
                showMessage(T('msg.noPathToReverse'));
            }
        }

        // 軌跡大小自動調整功能
        function autoScalePath(silent = false) {
            const rawText = inputTextEl.value;
            const textChars = rawText.replace(/\s+/g, '').split('');

            if (textChars.length < 2) {
                if (!silent) showMessage(T('msg.needMoreChars'));
                return;
            }
            if (pathPoints.length < 2) {
                if (!silent) showMessage(T('msg.drawPathFirst'));
                return;
            }

            // 計算目前軌跡的總長度
            let totalLen = 0;
            for (let i = 1; i < pathPoints.length; i++) {
                totalLen += Math.hypot(pathPoints[i].x - pathPoints[i-1].x, pathPoints[i].y - pathPoints[i-1].y);
            }

            if (totalLen === 0) return;

            // 依格線大小計算每個字所需的理想間距
            const cols = parseInt(gridSizeEl.value);
            const ratio = canvas.height / canvas.width;
            const rows = Math.max(10, Math.floor(cols * ratio));
            const cw = canvas.width / cols;
            const ch = canvas.height / rows;
            const cellSize = Math.min(cw, ch);

            // 取得滑桿設定的間距倍率
            const spacingMultiplier = parseFloat(densitySlider.value);

            // 依間距倍率計算理想的整體軌跡長度
            const idealLen = (textChars.length - 1) * (cellSize * spacingMultiplier);

            let scale = idealLen / totalLen;

            // 找出軌跡的中心點（Bounding Box 的中央）
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            pathPoints.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });

            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            const width = maxX - minX;
            const height = maxY - minY;

            // 限制最大縮放比例，避免超出畫布範圍（含 10% 邊界留白）
            const maxScaleX = width > 0 ? (canvas.width * 0.9) / width : Infinity;
            const maxScaleY = height > 0 ? (canvas.height * 0.9) / height : Infinity;

            scale = Math.min(scale, maxScaleX, maxScaleY);

            // 以中心點為基準縮放各座標
            pathPoints = pathPoints.map(p => ({
                x: cx + (p.x - cx) * scale,
                y: cy + (p.y - cy) * scale
            }));

            redrawPath();

            // 若結果已經產生，變更縮放後立即重新產生
            if (outputTextEl.value.trim() !== '') {
                generateText();
            } else {
                if (!silent) showMessage(T('msg.autoScaled'));
            }
        }

        function setShape(shape) {
            currentShapeMode = shape;
            
            // Update UI buttons
            document.querySelectorAll('.shape-btn').forEach(btn => {
                btn.classList.remove('ring-2', 'ring-blue-500', 'text-blue-600');
            });
            
            // Apply styles to selected button manually based on inner text matching
            const buttons = document.querySelectorAll('.shape-btn');
            for (let btn of buttons) {
                if ((shape === 'custom' && btn.id === 'btn-custom') || 
                    btn.textContent.toLowerCase().includes(shape)) {
                    btn.classList.add('ring-2', 'ring-blue-500', 'text-blue-600');
                }
            }

            drawHint.style.display = 'none';

            if (shape === 'custom') {
                if(pathPoints.length === 0) {
                    drawHint.style.display = 'flex';
                }
                return; // Wait for user to draw
            }

            pathPoints = [];
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const scale = Math.min(cx, cy) * 0.8;

            if (shape === 'circle') {
                // Start from top (-PI/2) and go clockwise
                for (let t = -Math.PI / 2; t < 1.5 * Math.PI; t += 0.05) {
                    pathPoints.push({ x: cx + scale * Math.cos(t), y: cy + scale * Math.sin(t) });
                }
            } else if (shape === 'spiral') {
                // Archimedean spiral
                let a = 0.1;
                let b = scale / (3 * Math.PI * 2); // 3 loops
                // Start from center to outwards
                for (let t = 0; t < 3 * Math.PI * 2; t += 0.05) {
                    let r = a + b * t;
                    // Rotate slightly so it starts nicely
                    pathPoints.push({ x: cx + r * Math.cos(t - Math.PI/2), y: cy + r * Math.sin(t - Math.PI/2) });
                }
            } else if (shape === 'heart') {
                // Heart curve: x = 16sin^3(t), y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
                for (let t = 0; t <= Math.PI * 2; t += 0.05) {
                    let x = 16 * Math.pow(Math.sin(t), 3);
                    let y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
                    
                    // Center and scale heart
                    pathPoints.push({ 
                        x: cx + x * (scale / 16), 
                        y: cy + y * (scale / 16) - (scale * 0.1) // Adjust Y slightly for better centering
                    });
                }
            }
            redrawPath();
        }

        function redrawPath() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (pathPoints.length < 2) return;

            ctx.beginPath();
            ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
            for (let i = 1; i < pathPoints.length; i++) {
                ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
            }
            ctx.strokeStyle = '#3b82f6'; // Tailwind blue-500
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Draw start point indicator
            ctx.beginPath();
            ctx.arc(pathPoints[0].x, pathPoints[0].y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444'; // Red start point
            ctx.fill();
        }

        function resamplePath(points, numPoints) {
            if (points.length === 0) return [];
            if (points.length === 1 || numPoints <= 1) return Array(Math.max(1, numPoints)).fill(points[0]);

            let totalLen = 0;
            let lengths = [0];
            for (let i = 1; i < points.length; i++) {
                let dx = points[i].x - points[i-1].x;
                let dy = points[i].y - points[i-1].y;
                totalLen += Math.sqrt(dx*dx + dy*dy);
                lengths.push(totalLen);
            }

            if (totalLen === 0) return Array(numPoints).fill(points[0]);

            let step = totalLen / (Math.max(1, numPoints - 1));
            let resampled = [];
            resampled.push(points[0]);

            let currDist = step;
            let ptIdx = 1;

            for (let i = 1; i < numPoints - 1; i++) {
                while (ptIdx < points.length && lengths[ptIdx] < currDist) {
                    ptIdx++;
                }
                
                if (ptIdx >= points.length) {
                    resampled.push(points[points.length - 1]);
                    continue;
                }

                let p0 = points[ptIdx-1];
                let p1 = points[ptIdx];
                let d0 = lengths[ptIdx-1];
                let d1 = lengths[ptIdx];

                let t = (currDist - d0) / (d1 - d0);
                let x = p0.x + (p1.x - p0.x) * t;
                let y = p0.y + (p1.y - p0.y) * t;
                resampled.push({x, y});
                currDist += step;
            }

            while(resampled.length < numPoints) {
                resampled.push(points[points.length - 1]);
            }
            
            return resampled;
        }

        function generateText() {
            // 1. Process Input
            const rawText = inputTextEl.value;
            // Remove space/newlines so characters follow the path continuously
            const textChars = rawText.replace(/\s+/g, '').split(''); 
            
            if (textChars.length === 0) {
                showMessage(T('msg.enterText'));
                return;
            }
            if (pathPoints.length < 2) {
                showMessage(T('msg.drawOrSelectShape'));
                return;
            }

            // 2. Resample Path to match character count
            const sampledPoints = resamplePath(pathPoints, textChars.length);

            // 3. Grid setup
            const cols = parseInt(gridSizeEl.value);
            // Calculate aspect ratio. Assuming canvas is roughly 2:1 and characters are 1:1 in grid
            const ratio = canvas.height / canvas.width;
            const rows = Math.max(10, Math.floor(cols * ratio)); 
            
            // Initialize empty grid (2D Array)
            const grid = Array(rows).fill(null).map(() => Array(cols).fill(null));

            // Map canvas points to grid coordinates
            const placedCoords = [];
            for (let i = 0; i < textChars.length; i++) {
                const pt = sampledPoints[i];
                // Map from [0, canvas.width] to [0, cols-1]
                let c = Math.floor((pt.x / canvas.width) * cols);
                let r = Math.floor((pt.y / canvas.height) * rows);
                
                // Keep within bounds
                c = Math.max(0, Math.min(cols - 1, c));
                r = Math.max(0, Math.min(rows - 1, r));

                // Place char in grid (with simple collision resolving)
                placeChar(grid, r, c, textChars[i]);
            }

            // 4. Generate string output
            const baseSpaceChar = spaceCharEl.value; 
            let outputLines = [];
            
            for (let r = 0; r < rows; r++) {
                let rowString = "";
                for (let c = 0; c < cols; c++) {
                    if (grid[r][c] !== null) {
                        rowString += grid[r][c];
                    } else {
                        rowString += baseSpaceChar;
                    }
                }
                outputLines.push(rowString);
            }

            // Trim completely empty rows and columns to make output compact
            let trimmedOutput = trimGrid(outputLines, baseSpaceChar);

            // 若啟用 Twitter 選項，將每行開頭的第一個空白換成點字符號（U+2800），避免換行被吃掉
            if (twitterOptEl.checked) {
                trimmedOutput = trimmedOutput.map(line => {
                    if (line.startsWith(baseSpaceChar)) {
                        return '⠀' + line.substring(baseSpaceChar.length);
                    }
                    return line;
                });
            }
            
            // Display result
            outputTextEl.value = trimmedOutput.join('\n');
            outputCharCountEl.textContent = outputTextEl.value.length; // 更新結果總字數
            
            // Re-draw path with characters to show user the mapping visually
            visualizeGrid(grid, cols, rows);
        }

        // Spiral search to find nearest empty cell if intended cell is occupied
        function placeChar(grid, r, c, char) {
            const rows = grid.length;
            const cols = grid[0].length;

            if (grid[r][c] === null) {
                grid[r][c] = char;
                return;
            }

            // Search radius incrementally
            const maxRadius = Math.max(rows, cols);
            for (let radius = 1; radius < maxRadius; radius++) {
                for (let i = -radius; i <= radius; i++) {
                    for (let j = -radius; j <= radius; j++) {
                        // Check perimeter of current radius box
                        if (Math.abs(i) === radius || Math.abs(j) === radius) {
                            let nr = r + i;
                            let nc = c + j;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                                if (grid[nr][nc] === null) {
                                    grid[nr][nc] = char;
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Remove empty borders from the final grid
        function trimGrid(lines, spaceChar) {
            let minR = lines.length, maxR = -1;
            let minC = lines[0].length, maxC = -1;

            // Find bounds
            for (let r = 0; r < lines.length; r++) {
                for (let c = 0; c < lines[r].length; c++) {
                    if (lines[r][c] !== spaceChar) {
                        if (r < minR) minR = r;
                        if (r > maxR) maxR = r;
                        if (c < minC) minC = c;
                        if (c > maxC) maxC = c;
                    }
                }
            }

            if (minR > maxR) return [""]; // Empty

            let result = [];
            for (let r = minR; r <= maxR; r++) {
                result.push(lines[r].substring(minC, maxC + 1));
            }
            return result;
        }

        function visualizeGrid(grid, cols, rows) {
            redrawPath(); // Redraw base path
            const cw = canvas.width / cols;
            const ch = canvas.height / rows;

            ctx.fillStyle = '#1f2937'; // gray-800
            /* 合輯追加繁中字型：Noto Sans TC 沒有諺文，韓文仍會落到 Noto Sans KR，
               因此兩種語言的字都畫得出來，中文也不會被畫成韓文的漢字字形。 */
            ctx.font = `bold ${Math.min(cw, ch) * 0.8}px "Noto Sans TC", "Noto Sans KR", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (grid[r][c] !== null) {
                        ctx.fillText(grid[r][c], (c + 0.5) * cw, (r + 0.5) * ch);
                    }
                }
            }
        }

        function copyToClipboard() {
            const text = outputTextEl.value;
            if (!text) {
                showMessage(T('msg.nothingToCopy'));
                return;
            }

            // Using document.execCommand('copy') as requested for compatibility in environments
            outputTextEl.select();
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showMessage(T('msg.copied'));
                } else {
                    showMessage(T('msg.copyFailed'));
                }
            } catch (err) {
                showMessage(T('msg.copyUnsupported'));
            }
            
            // Clear selection visually
            window.getSelection().removeAllRanges();
        }

        function showMessage(msg) {
            const box = document.getElementById('messageBox');
            box.textContent = msg;
            box.classList.remove('hidden');
            box.style.opacity = '1';

            setTimeout(() => {
                box.style.opacity = '0';
                setTimeout(() => box.classList.add('hidden'), 300); // Wait for transition
            }, 3000);
        }

        I18N.mountSwitcher(document.getElementById('localeSelect'));
        I18N.onChange(() => { renderDensityLabel(); /* 重繪動態字串 */ });
