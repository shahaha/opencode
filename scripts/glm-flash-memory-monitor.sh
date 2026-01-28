#!/bin/bash

# GLM-4.7-Flash Memory Monitor and Optimization Script
# This script monitors memory usage and provides optimization recommendations

echo "🧠 GLM-4.7-Flash Memory Monitor"
echo "=================================="

# Check current memory status
echo "📊 Current Memory Status:"
free -h | grep -E "^Mem|^Swap"

echo ""

# Check available memory in GB
AVAILABLE_MEM=$(free -g | awk '/^Mem:/{print $7}')
echo "💾 Available Memory: ${AVAILABLE_MEM}GB"

# Memory threshold check
MINIMUM_REQUIRED=8
RECOMMENDED=12

if [ "$AVAILABLE_MEM" -lt "$MINIMUM_REQUIRED" ]; then
    echo "⚠️  WARNING: Available memory (${AVAILABLE_MEM}GB) is below minimum requirement (${MINIMUM_REQUIRED}GB)"
    echo "💡 Recommendations:"
    echo "   - Close unnecessary applications"
    echo "   - Clear system cache: sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'"
    echo "   - Restart services to free memory"
elif [ "$AVAILABLE_MEM" -lt "$RECOMMENDED" ]; then
    echo "✅ Sufficient memory for GLM-4.7-Flash (${AVAILABLE_MEM}GB >= ${MINIMUM_REQUIRED}GB)"
    echo "💡 For optimal performance, consider freeing up to ${RECOMMENDED}GB"
else
    echo "✅ Excellent: Sufficient memory for optimal GLM-4.7-Flash performance (${AVAILABLE_MEM}GB >= ${RECOMMENDED}GB)"
fi

echo ""

# Check if GLM-4.7-Flash model is available
echo "🤖 GLM-4.7-Flash Model Status:"
if opencode models ollama | grep -q "glm-4.7-flash"; then
    echo "✅ GLM-4.7-Flash is available and configured"
else
    echo "❌ GLM-4.7-Flash is not available"
fi

echo ""

# Memory optimization tips
echo "🔧 Memory Optimization Tips:"
echo "1. Monitor memory usage during model operation:"
echo "   watch -n 2 'free -h | grep Mem'"
echo ""
echo "2. Clear package caches if needed:"
echo "   bun pm cache rm"
echo "   npm cache clean --force"
echo ""
echo "3. Check for memory-intensive processes:"
echo "   ps aux --sort=-%mem | head -10"
echo ""

# Show GLM-4.7-Flash configuration
echo "⚙️  GLM-4.7-Flash Configuration:"
if [ -f "/home/rick/prj/opencode/packages/opencode/test/tool/fixtures/models-api.json" ]; then
    echo "Memory Requirements:"
    grep -A 5 '"glm-4.7-flash"' /home/rick/prj/opencode/packages/opencode/test/tool/fixtures/models-api.json | grep -E '"memory"|"required"|"recommended"|"minimum"' || echo "   No explicit memory requirements found in config"
fi

echo ""
echo "🎯 GLM-4.7-Flash Memory Requirements Summary:"
echo "   Minimum: ${MINIMUM_REQUIRED}GB"
echo "   Recommended: ${RECOMMENDED}GB" 
echo "   Current Available: ${AVAILABLE_MEM}GB"
echo "   Status: $([ "$AVAILABLE_MEM" -ge "$RECOMMENDED" ] && echo "✅ Optimal" || [ "$AVAILABLE_MEM" -ge "$MINIMUM_REQUIRED" ] && echo "✅ Sufficient" || echo "⚠️  Insufficient")"