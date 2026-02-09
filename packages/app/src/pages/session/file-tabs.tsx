import { type ValidComponent, createEffect, createMemo, For, Match, on, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { checksum } from "@opencode-ai/util/encode"
import { decode64 } from "@/utils/base64"
import { showToast } from "@opencode-ai/ui/toast"
import { LineComment as LineCommentView, LineCommentEditor } from "@opencode-ai/ui/line-comment"
import { Mark } from "@opencode-ai/ui/logo"
import { Tabs } from "@opencode-ai/ui/tabs"
import { useLayout } from "@/context/layout"
import { useFile, type SelectedLineRange } from "@/context/file"
import { useComments } from "@/context/comments"
import { useLanguage } from "@/context/language"

export function FileTabContent(props: {
  tab: string
  activeTab: () => string
  tabs: () => ReturnType<ReturnType<typeof useLayout>["tabs"]>
  view: () => ReturnType<ReturnType<typeof useLayout>["view"]>
  handoffFiles: () => Record<string, SelectedLineRange | null> | undefined
  file: ReturnType<typeof useFile>
  comments: ReturnType<typeof useComments>
  language: ReturnType<typeof useLanguage>
  codeComponent: NonNullable<ValidComponent>
  addCommentToContext: (input: {
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
    origin?: "review" | "file"
  }) => void
}) {
  let scroll: HTMLDivElement | undefined
  let scrollFrame: number | undefined
  let pending: { x: number; y: number } | undefined
  let codeScroll: HTMLElement[] = []
  let hScrollbar: HTMLDivElement | undefined
  let hScrollContent: HTMLDivElement | undefined
  let syncingHScroll = false
  let shadowObserver: MutationObserver | undefined

  const path = createMemo(() => props.file.pathFromTab(props.tab))
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return props.file.get(p)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const cacheKey = createMemo(() => checksum(contents()))
  const isImage = createMemo(() => {
    const c = state()?.content
    return c?.encoding === "base64" && c?.mimeType?.startsWith("image/") && c?.mimeType !== "image/svg+xml"
  })
  const isSvg = createMemo(() => {
    const c = state()?.content
    return c?.mimeType === "image/svg+xml"
  })
  const isBinary = createMemo(() => state()?.content?.type === "binary")
  const svgContent = createMemo(() => {
    if (!isSvg()) return
    const c = state()?.content
    if (!c) return
    if (c.encoding !== "base64") return c.content
    return decode64(c.content)
  })

  const svgDecodeFailed = createMemo(() => {
    if (!isSvg()) return false
    const c = state()?.content
    if (!c) return false
    if (c.encoding !== "base64") return false
    return svgContent() === undefined
  })

  const svgToast = { shown: false }
  createEffect(() => {
    if (!svgDecodeFailed()) return
    if (svgToast.shown) return
    svgToast.shown = true
    showToast({
      variant: "error",
      title: props.language.t("toast.file.loadFailed.title"),
      description: "Invalid base64 content.",
    })
  })
  const svgPreviewUrl = createMemo(() => {
    if (!isSvg()) return
    const c = state()?.content
    if (!c) return
    if (c.encoding === "base64") return `data:image/svg+xml;base64,${c.content}`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.content)}`
  })
  const imageDataUrl = createMemo(() => {
    if (!isImage()) return
    const c = state()?.content
    return `data:${c?.mimeType};base64,${c?.content}`
  })
  const selectedLines = createMemo(() => {
    const p = path()
    if (!p) return null
    if (props.file.ready()) return props.file.selectedLines(p) ?? null
    return props.handoffFiles()?.[p] ?? null
  })

  let wrap: HTMLDivElement | undefined

  const fileComments = createMemo(() => {
    const p = path()
    if (!p) return []
    return props.comments.list(p)
  })

  const commentedLines = createMemo(() => fileComments().map((comment) => comment.selection))

  const commentAnchors = createMemo(() =>
    fileComments().map((comment) => ({
      id: comment.id,
      line: Math.max(comment.selection.start, comment.selection.end),
    })),
  )

  const [note, setNote] = createStore({
    openedComment: null as string | null,
    commenting: null as SelectedLineRange | null,
    draft: "",
    positions: {} as Record<string, number>,
    draftTop: undefined as number | undefined,
    viewportWidth: 0,
    codeScrollLeft: 0,
  })

  const openedComment = () => note.openedComment
  const setOpenedComment = (
    value: typeof note.openedComment | ((value: typeof note.openedComment) => typeof note.openedComment),
  ) => setNote("openedComment", value)

  const commenting = () => note.commenting
  const setCommenting = (value: typeof note.commenting | ((value: typeof note.commenting) => typeof note.commenting)) =>
    setNote("commenting", value)

  const draft = () => note.draft
  const setDraft = (value: typeof note.draft | ((value: typeof note.draft) => typeof note.draft)) =>
    setNote("draft", value)

  const positions = () => note.positions
  const setPositions = (value: typeof note.positions | ((value: typeof note.positions) => typeof note.positions)) =>
    setNote("positions", value)

  const draftTop = () => note.draftTop
  const setDraftTop = (value: typeof note.draftTop | ((value: typeof note.draftTop) => typeof note.draftTop)) =>
    setNote("draftTop", value)

  const viewportWidth = () => note.viewportWidth
  const codeScrollLeft = () => note.codeScrollLeft

  const commentLabel = (range: SelectedLineRange) => {
    const start = Math.min(range.start, range.end)
    const end = Math.max(range.start, range.end)
    if (start === end) return `line ${start}`
    return `lines ${start}-${end}`
  }

  const getRoot = () => {
    const el = wrap
    if (!el) return

    const host = el.querySelector("diffs-container")
    if (!(host instanceof HTMLElement)) return

    const root = host.shadowRoot
    if (!root) return

    return root
  }

  const findMarker = (root: ShadowRoot, range: SelectedLineRange) => {
    const line = Math.max(range.start, range.end)
    const node = root.querySelector(`[data-line="${line}"]`)
    if (!(node instanceof HTMLElement)) return
    return node
  }

  const markerTop = (wrapper: HTMLElement, marker: HTMLElement) => {
    const wrapperRect = wrapper.getBoundingClientRect()
    const rect = marker.getBoundingClientRect()
    return rect.top - wrapperRect.top + Math.max(0, rect.height)
  }

  const updateComments = () => {
    const el = wrap
    const root = getRoot()
    if (!el || !root) {
      setPositions({})
      setDraftTop(undefined)
      return
    }

    const next: Record<string, number> = {}
    for (const comment of fileComments()) {
      const marker = findMarker(root, comment.selection)
      if (!marker) continue
      next[comment.id] = markerTop(el, marker)
    }

    setPositions(next)

    const range = commenting()
    if (!range) {
      setDraftTop(undefined)
      return
    }

    const marker = findMarker(root, range)
    if (!marker) {
      setDraftTop(undefined)
      return
    }

    setDraftTop(markerTop(el, marker))
  }

  const scheduleComments = () => {
    requestAnimationFrame(updateComments)
  }

  createEffect(() => {
    fileComments()
    scheduleComments()
  })

  createEffect(() => {
    const range = commenting()
    scheduleComments()
    if (!range) return
    setDraft("")
  })

  createEffect(() => {
    const focus = props.comments.focus()
    const p = path()
    if (!focus || !p) return
    if (focus.file !== p) return
    if (props.activeTab() !== props.tab) return

    const target = fileComments().find((comment) => comment.id === focus.id)
    if (!target) return

    setOpenedComment(target.id)
    setCommenting(null)
    props.file.setSelectedLines(p, target.selection)
    requestAnimationFrame(() => props.comments.clearFocus())
  })

  let wrapResizeObserver: ResizeObserver | undefined

  const getCodeScroll = () => {
    const el = scroll
    if (!el) return []

    const host = el.querySelector("diffs-container")
    if (!(host instanceof HTMLElement)) return []

    const root = host.shadowRoot
    if (!root) return []

    return Array.from(root.querySelectorAll("[data-code]")).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.clientWidth > 0,
    )
  }

  const queueScrollUpdate = (next: { x: number; y: number }) => {
    pending = next
    if (scrollFrame !== undefined) return

    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined

      const out = pending
      pending = undefined
      if (!out) return

      props.view().setScroll(props.tab, out)
    })
  }

  const handleCodeScroll = (event: Event) => {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return

    queueScrollUpdate({
      x: target.scrollLeft,
      y: scroll?.scrollTop ?? 0,
    })

    // Track horizontal scroll for anchor positioning
    setNote("codeScrollLeft", target.scrollLeft)

    if (!syncingHScroll && hScrollbar) {
      syncingHScroll = true
      hScrollbar.scrollLeft = target.scrollLeft
      syncingHScroll = false
    }
  }

  const syncCodeScroll = () => {
    const next = getCodeScroll()
    if (next.length === codeScroll.length && next.every((el, i) => el === codeScroll[i])) return

    for (const item of codeScroll) {
      item.removeEventListener("scroll", handleCodeScroll)
    }

    codeScroll = next

    for (const item of codeScroll) {
      item.addEventListener("scroll", handleCodeScroll)
    }
  }

  // Watch for DOM changes (e.g. syntax highlighting) that may recreate [data-code] elements
  const setupShadowObserver = () => {
    if (shadowObserver) return

    const el = scroll
    if (!el) return

    const host = el.querySelector("diffs-container")
    if (!(host instanceof HTMLElement)) return

    const root = host.shadowRoot
    if (!root) return

    shadowObserver = new MutationObserver(() => {
      syncCodeScroll()
      updateHScrollbarWidth()
    })
    shadowObserver.observe(root, { childList: true, subtree: true })
  }

  const restoreScroll = () => {
    const el = scroll
    if (!el) return

    syncCodeScroll()

    const s = props.view()?.scroll(props.tab)
    if (!s) return

    if (codeScroll.length > 0) {
      for (const item of codeScroll) {
        if (item.scrollLeft !== s.x) item.scrollLeft = s.x
      }
      if (hScrollbar && hScrollbar.scrollLeft !== s.x) {
        hScrollbar.scrollLeft = s.x
      }

      // Track initial horizontal scroll position
      setNote("codeScrollLeft", s.x)
    }

    // Always restore vertical scroll
    if (el.scrollTop !== s.y) el.scrollTop = s.y

    // Only set horizontal scroll on container if no code scroll elements
    if (codeScroll.length > 0) return
    if (el.scrollLeft !== s.x) el.scrollLeft = s.x
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    if (codeScroll.length === 0) syncCodeScroll()

    queueScrollUpdate({
      x: codeScroll[0]?.scrollLeft ?? event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    })
  }

  const updateHScrollbarWidth = () => {
    if (!hScrollContent) return
    const code = codeScroll[0]
    if (!code) {
      hScrollContent.style.width = "0"
      return
    }
    hScrollContent.style.width = `${code.scrollWidth}px`
  }

  const handleHScrollbarScroll = () => {
    if (syncingHScroll || !hScrollbar) return
    syncingHScroll = true
    for (const item of codeScroll) {
      item.scrollLeft = hScrollbar.scrollLeft
    }
    queueScrollUpdate({
      x: hScrollbar.scrollLeft,
      y: scroll?.scrollTop ?? 0,
    })
    syncingHScroll = false
  }

  createEffect(
    on(
      () => state()?.loaded,
      (loaded) => {
        if (!loaded) return
        requestAnimationFrame(restoreScroll)
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => props.file.ready(),
      (ready) => {
        if (!ready) return
        requestAnimationFrame(restoreScroll)
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => props.tabs().active() === props.tab,
      (active) => {
        if (!active) return
        if (!state()?.loaded) return
        requestAnimationFrame(restoreScroll)
      },
    ),
  )

  onCleanup(() => {
    for (const item of codeScroll) {
      item.removeEventListener("scroll", handleCodeScroll)
    }

    shadowObserver?.disconnect()
    shadowObserver = undefined

    wrapResizeObserver?.disconnect()

    if (scrollFrame !== undefined) {
      cancelAnimationFrame(scrollFrame)
    }
  })

  const renderCode = (source: string, wrapperClass: string) => (
    <div
      ref={(el) => {
        wrap = el
        scheduleComments()

        // Track viewport width for anchor positioning
        wrapResizeObserver?.disconnect()
        wrapResizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            setNote("viewportWidth", entry.contentRect.width)
          }
        })
        wrapResizeObserver.observe(el)
      }}
      class={`relative ${wrapperClass}`}
    >
      <Dynamic
        component={props.codeComponent}
        file={{
          name: path() ?? "",
          contents: source,
          cacheKey: cacheKey(),
        }}
        enableLineSelection
        selectedLines={selectedLines()}
        commentedLines={commentedLines()}
        commentAnchors={commentAnchors()}
        anchorViewportWidth={viewportWidth()}
        anchorScrollLeft={codeScrollLeft()}
        onRendered={() => {
          requestAnimationFrame(() => {
            syncCodeScroll()
            restoreScroll()
            updateHScrollbarWidth()
            setupShadowObserver()
          })
          requestAnimationFrame(scheduleComments)
        }}
        onLineSelected={(range: SelectedLineRange | null) => {
          const p = path()
          if (!p) return
          props.file.setSelectedLines(p, range)
          if (!range) setCommenting(null)
        }}
        onLineSelectionEnd={(range: SelectedLineRange | null) => {
          if (!range) {
            setCommenting(null)
            return
          }

          setOpenedComment(null)
          setCommenting(range)
        }}
        onCommentAnchorClick={(id: string) => {
          const p = path()
          if (!p) return
          const comment = fileComments().find((c) => c.id === id)
          if (!comment) return
          setCommenting(null)
          setOpenedComment((current) => (current === id ? null : id))
          props.file.setSelectedLines(p, comment.selection)
        }}
        onCommentAnchorHover={(id: string | null) => {
          const p = path()
          if (!p) return
          if (id) {
            const comment = fileComments().find((c) => c.id === id)
            if (comment) props.file.setSelectedLines(p, comment.selection)
          }
        }}
        overflow="scroll"
        class="select-text"
      />
      <For each={fileComments()}>
        {(comment) => (
          <LineCommentView
            id={comment.id}
            top={positions()[comment.id]}
            open={openedComment() === comment.id}
            hideAnchor
            comment={comment.comment}
            selection={commentLabel(comment.selection)}
            onMouseEnter={() => {
              const p = path()
              if (!p) return
              props.file.setSelectedLines(p, comment.selection)
            }}
            onClick={() => {
              const p = path()
              if (!p) return
              setCommenting(null)
              setOpenedComment((current) => (current === comment.id ? null : comment.id))
              props.file.setSelectedLines(p, comment.selection)
            }}
          />
        )}
      </For>
      <Show when={commenting()}>
        {(range) => (
          <Show when={draftTop() !== undefined}>
            <LineCommentEditor
              top={draftTop()}
              value={draft()}
              selection={commentLabel(range())}
              onInput={(value) => setDraft(value)}
              onCancel={() => setCommenting(null)}
              onSubmit={(value) => {
                const p = path()
                if (!p) return
                props.addCommentToContext({
                  file: p,
                  selection: range(),
                  comment: value,
                  origin: "file",
                })
                setCommenting(null)
              }}
              onPopoverFocusOut={(e: FocusEvent) => {
                const current = e.currentTarget as HTMLDivElement
                const target = e.relatedTarget
                if (target instanceof Node && current.contains(target)) return

                setTimeout(() => {
                  if (!document.activeElement || !current.contains(document.activeElement)) {
                    setCommenting(null)
                  }
                }, 0)
              }}
            />
          </Show>
        )}
      </Show>
    </div>
  )

  return (
    <Tabs.Content
      value={props.tab}
      class="mt-3 relative session-scroller"
      ref={(el: HTMLDivElement) => {
        scroll = el
        restoreScroll()
      }}
      onScroll={handleScroll}
    >
      <Switch>
        <Match when={state()?.loaded && isImage()}>
          <div class="px-6 py-4 pb-40">
            <img
              src={imageDataUrl()}
              alt={path()}
              class="max-w-full"
              onLoad={() => requestAnimationFrame(restoreScroll)}
            />
          </div>
        </Match>
        <Match when={state()?.loaded && isSvg()}>
          <div class="flex flex-col gap-4 px-6 py-4">
            {renderCode(svgContent() ?? "", "")}
            <Show when={svgPreviewUrl()}>
              <div class="flex justify-center pb-40">
                <img src={svgPreviewUrl()} alt={path()} class="max-w-full max-h-96" />
              </div>
            </Show>
          </div>
        </Match>
        <Match when={state()?.loaded && isBinary()}>
          <div class="h-full px-6 pb-42 flex flex-col items-center justify-center text-center gap-6">
            <Mark class="w-14 opacity-10" />
            <div class="flex flex-col gap-2 max-w-md">
              <div class="text-14-semibold text-text-strong truncate">{path()?.split("/").pop()}</div>
              <div class="text-14-regular text-text-weak">{props.language.t("session.files.binaryContent")}</div>
            </div>
          </div>
        </Match>
        <Match when={state()?.loaded}>{renderCode(contents(), "pb-40")}</Match>
        <Match when={state()?.loading}>
          <div class="px-6 py-4 text-text-weak">{props.language.t("common.loading")}...</div>
        </Match>
        <Match when={state()?.error}>{(err) => <div class="px-6 py-4 text-text-weak">{err()}</div>}</Match>
      </Switch>
      <Show when={state()?.loaded && !isImage() && !isSvg() && !isBinary()}>
        <div
          ref={(el) => (hScrollbar = el)}
          onScroll={handleHScrollbarScroll}
          class="session-scroller sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden bg-background-base"
          style={{ height: "12px" }}
        >
          <div ref={(el) => (hScrollContent = el)} style={{ height: "1px" }} />
        </div>
      </Show>
    </Tabs.Content>
  )
}
