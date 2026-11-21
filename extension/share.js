(() => {
  const { settings, postLink, postSelector, copyPostImage, videoDownload, closeMenu, openMenu } = BetterX
  const shareSelector = '[data-engagement-action="share"], [data-testid="share"], :is(button, [role="button"]):is([aria-label="Share" i], [aria-label="Share post" i], [aria-label="Share Tweet" i])'
  const moreSelector = '[data-testid="caret"], [data-engagement-action="more"]'

  window.addEventListener('click', event => {
    const { target } = event
    if (!event.isTrusted || !(target instanceof Element)) return
    const trigger = target.closest(`${shareSelector}, ${moreSelector}`)
    if (!trigger) return
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      closeMenu()
      return
    }
    const post = trigger.closest(postSelector) ||
      trigger.closest('dialog, [role="dialog"]')?.querySelector('article')
    const link = post && postLink(post)
    if (!link) return

    event.preventDefault()
    event.stopImmediatePropagation()
    if (closeMenu() === trigger) {
      trigger.focus({ preventScroll: true })
      return
    }

    const more = trigger.matches(moreSelector)
    const copied = new URL(link)
    copied.hostname = settings.linkHost
    const actions = [
      ['Copy link', () => navigator.clipboard.writeText(copied.href), 'Copied post link'],
    ]
    if (more) actions.push(['Open post in new tab', () => window.open(link.href, '_blank', 'noopener,noreferrer')])
    const bookmark = Array.from(post.querySelectorAll('[data-testid="bookmark"], [data-testid="removeBookmark"]'))
      .find(item => item.closest(postSelector) === post && !item.matches('[disabled], [aria-disabled="true"]'))
    if (bookmark) {
      const action = bookmark.dataset.testid
      actions.push([action === 'bookmark' ? 'Bookmark' : 'Remove bookmark', () => {
        if (postLink(post)?.href === link.href && bookmark.isConnected && bookmark.dataset.testid === action) bookmark.click()
      }])
    }
    const download = settings.downloads && videoDownload(post, link)
    if (download) actions.push(download)
    if (settings.copyImage) {
      actions.push(['Copy as image', () => {
        if (postLink(post)?.href !== link.href) throw new Error('Could not locate post')
        return copyPostImage(post, link)
      }, 'Copied post image'])
    }
    actions.push(['Open 𝕏 menu', () => trigger.click()])

    const { right, top, bottom } = trigger.getBoundingClientRect()
    const above = bottom > innerHeight / 2
    openMenu(actions, {
      label: more ? 'Post actions' : 'Share post',
      opener: trigger,
      x: right,
      y: above ? top - 6 : bottom + 6,
      alignEnd: true,
      above,
    })
  }, true)
})()
